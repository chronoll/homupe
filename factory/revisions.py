"""Trusted PR revision requests. Parent owns GitHub, journals and branch writes."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import time
import tempfile
from datetime import datetime

from factory.core import Halt, Runner, SHA, atomic_json, git, parse_json

HELP_MARKER = '<!-- homupe-factory-revision-help:v1 -->'
RECEIPT_MARKER = '<!-- homupe-factory-revision-receipt:v1:'


class RevisionQueueStopped(Halt):
    """A PR fix never overrides an existing global stop request."""


def instruction(comment, trusted='chronoll'):
    if (not isinstance(comment, dict) or not isinstance(comment.get('user'), dict)
            or comment['user'].get('login') != trusted
            or comment.get('user', {}).get('type') not in (None, 'User')
            or type(comment.get('id')) is not int or comment['id'] <= 0
            or not isinstance(comment.get('created_at'), str)
            or comment.get('created_at') != comment.get('updated_at')):
        return None
    body = comment.get('body')
    try:
        if not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z', comment['created_at']):
            return None
        datetime.strptime(comment['created_at'], '%Y-%m-%dT%H:%M:%SZ')
    except ValueError:
        return None
    if not isinstance(body, str) or len(body) > 8000:
        return None
    match = re.fullmatch(r'/factory fix(?:\n| )([^\r].*)', body, re.DOTALL)
    if not match or not match.group(1).strip():
        return None
    return match.group(1).strip()


class Revisions:
    def __init__(self, factory, github):
        self.factory, self.github, self.store = factory, github, factory.store
        self.path = self.store.root / 'revisions.json'

    def load(self):
        if not self.path.exists():
            return {'version': 1, 'commands': {}}
        value = parse_json(self.path.read_bytes())
        if (not isinstance(value, dict) or value.get('version') != 1
                or not isinstance(value.get('commands'), dict)):
            raise Halt('invalid PR revision journal')
        for key, record in value['commands'].items():
            if (not isinstance(record, dict) or type(record.get('comment_id')) is not int
                    or record['comment_id'] < 1 or key != str(record['comment_id'])
                    or type(record.get('issue')) is not int or record['issue'] < 1
                    or type(record.get('pr')) is not int or record['pr'] < 1
                    or record.get('status') not in {'claimed', 'done', 'failed'}
                    or not isinstance(record.get('body_sha'), str)
                    or not re.fullmatch(r'[a-f0-9]{64}', record['body_sha'])
                    or ('message' in record and (not isinstance(record['message'], str)
                        or len(record['message']) > 2000))):
                raise Halt('invalid PR revision command record')
        return value

    def validate(self, revision, issue=None):
        number, pr_number, expected = revision['issue'], revision['pr'], revision['head_sha']
        if (type(number) is not int or number < 1 or type(pr_number) is not int or pr_number < 1
                or not isinstance(expected, str) or not SHA.fullmatch(expected)):
            raise Halt('invalid PR revision identity')
        pr = self.github.get('pulls/' + str(pr_number))
        branch = 'factory/issue-%s' % number
        if (pr.get('number') != pr_number or pr.get('state') != 'open' or pr.get('merged_at')
                or pr.get('user', {}).get('login') != 'chronoll'
                or pr.get('base', {}).get('ref') != 'staging'
                or pr.get('base', {}).get('repo', {}).get('full_name') != 'chronoll/homupe'
                or pr.get('head', {}).get('repo', {}).get('full_name') != 'chronoll/homupe'
                or pr.get('head', {}).get('ref') != branch or pr.get('head', {}).get('sha') != expected):
            raise Halt('PR changed, closed, merged or no longer matches the owned staging branch')
        actual = self.github.issue(number)
        if (actual.get('number') != number or actual.get('state') != 'open'
                or 'pull_request' in actual or actual.get('user', {}).get('login') != 'chronoll'):
            raise Halt('PR revisions require the original open, chronoll-authored Issue')
        if issue is not None and any(actual.get(k) != issue.get(k) for k in ('number', 'title', 'body')):
            raise Halt('Issue changed since the PR revision input was frozen')
        return pr, actual

    def _repair_paths(self, job):
        for relative in ('checkout', 'repair-1/checkout', 'revision-base'):
            checkout = job / relative
            if checkout.exists():
                git(Runner(), self.factory.repo, 'worktree', 'repair', str(checkout))

    def recover(self):
        for path in (self.store.root / 'revision-intents').glob('*.json'):
            data = parse_json(path.read_bytes())
            number, archive_name = data.get('issue'), data.get('archive')
            if (type(number) is not int or number < 1 or not isinstance(archive_name, str)
                    or not re.fullmatch(str(number) + r'\.attempt-[0-9]+', archive_name)):
                raise Halt('invalid PR revision recovery intent')
            job = self.store.job(number)
            archive = job.with_name(archive_name)
            committed = False
            if all((job / name).exists() for name in ('state.json', 'revision.json', 'issue.json')):
                state = parse_json((job / 'state.json').read_bytes())
                revision = parse_json((job / 'revision.json').read_bytes())
                issue = parse_json((job / 'issue.json').read_bytes())
                committed = (state.get('phase') == 'revision-queued' and state.get('version') == 1
                    and isinstance(issue, dict) and issue.get('number') == number
                    and state.get('issue') == number and state.get('revision') is True
                    and state.get('head_sha') == revision.get('head_sha') == data.get('head_sha')
                    and state.get('url') == 'https://github.com/chronoll/homupe/pull/%s' % data.get('pr')
                    and state.get('branch') == 'factory/issue-%s' % number
                    and revision.get('issue') == number and revision.get('pr') == data.get('pr')
                    and type(revision.get('pr')) is int and revision['pr'] > 0
                    and isinstance(revision.get('head_sha'), str) and SHA.fullmatch(revision['head_sha'])
                    and isinstance(revision.get('instructions'), str) and bool(revision['instructions'].strip())
                    and revision.get('comment_id') == data.get('comment_id'))
            if committed and archive.exists():
                self._repair_paths(archive)
                stop = self.store.root / 'STOP'
                if stop.exists() and stop.stat().st_mtime_ns == data.get('stop_mtime_ns'):
                    stop.unlink()
            elif archive.exists():
                self.store.stop()
                if job.exists():
                    job.rename(job.with_name(str(number) + '.partial-revision-' + str(time.time_ns())))
                archive.rename(job)
                self._repair_paths(job)
            elif not job.exists():
                self.store.stop()
                raise Halt('PR revision recovery evidence is missing')
            path.unlink()

    def queue(self, revision, fresh_request=False):
        stop = self.store.root / 'STOP'
        try:
            previous_stop = stop.stat().st_mtime_ns
        except FileNotFoundError:
            previous_stop = None
        if fresh_request and previous_stop is not None:
            raise RevisionQueueStopped('PR修正指示ではキューのSTOPを解除しません。')
        pr, issue = self.validate(revision)
        number = revision['issue']
        job = self.store.job(number)
        state = parse_json((job / 'state.json').read_bytes())
        if state.get('phase') not in {'draft-pr', 'needs-human'}:
            raise Halt('このIssueは処理中です。完了・停止後に新しい修正指示を送ってください。')
        if state.get('phase') == 'needs-human' and not (job / 'revision.json').exists():
            raise Halt('まだPR更新用の試行ではありません。Issueの停止理由を確認してください。')
        if state.get('url') != pr['html_url']:
            raise Halt('PR does not match the owned job')
        # A previous failed revision may have an unpublished candidate head;
        # its frozen remote head remains the authority for a fresh explicit try.
        frozen = (parse_json((job / 'revision.json').read_bytes())['head_sha']
                  if state.get('phase') == 'needs-human' else state.get('head_sha'))
        if frozen != revision['head_sha'] and not fresh_request:
            raise Halt('PRのheadが記録と一致しません。現在のPR変更を確認してください。')
        archive = job.with_name(str(number) + '.attempt-' + str(time.time_ns()))
        # Link a pre-stamped temporary sentinel exclusively: never touch over a
        # STOP that arrived during the GitHub reads. A concurrent emergency stop
        # after the link changes its known mtime and is retained by recovery.
        fd, name = tempfile.mkstemp(prefix='.revision-stop-', dir=self.store.root)
        try:
            owned_stop = os.fstat(fd).st_mtime_ns
            try:
                os.link(name, stop)
            except FileExistsError:
                if fresh_request:
                    raise RevisionQueueStopped('PR修正指示ではキューのSTOPを解除しません。')
                owned_stop = previous_stop
        finally:
            os.close(fd)
            Path(name).unlink(missing_ok=True)
        intent = self.store.root / 'revision-intents' / (str(number) + '.json')
        atomic_json(intent, {'issue': number, 'archive': archive.name,
            'comment_id': revision['comment_id'],
            'pr': revision['pr'], 'head_sha': revision['head_sha'],
            'stop_mtime_ns': owned_stop})
        try:
            job.rename(archive)
            job.mkdir(mode=0o700)
            atomic_json(job / 'issue.json', issue)
            atomic_json(job / 'revision.json', revision)
            self.store.save(number, 'revision-queued', url=pr['html_url'],
                branch=pr['head']['ref'], head_sha=revision['head_sha'], revision=True)
            self._repair_paths(archive)
            labels = self.github.issue(number).get('labels', [])
            if 'factory:needs-human' in {x if isinstance(x, str) else x['name'] for x in labels}:
                self.github.remove_label(number, 'factory:needs-human')
        except BaseException:
            # Recovery preserves either the old held attempt or the fully
            # committed queued revision. Never erase a partially written claim.
            raise
        self.recover()
        return {'issue': number, 'pr': revision['pr'], 'phase': 'revision-queued'}

    def retry(self, number):
        job = self.store.job(number)
        revision = parse_json((job / 'revision.json').read_bytes())
        # The explicit Issue retry authorizes a new attempt of the same request.
        return self.queue(revision)

    def _receipt(self, record):
        marker = RECEIPT_MARKER + str(record['comment_id']) + ' -->'
        comments = self.github.pages('issues/%s/comments?per_page=100' % record['pr'])
        if any(x.get('user', {}).get('login') == 'chronoll'
               and x.get('body', '').startswith(marker + '\n') for x in comments):
            return
        message = record.get('message', '修正指示は受付済みです。中断した結果を照合中です。同じ指示は再実行しません。')
        self.github.write('issues/%s/comments' % record['pr'], {'body': marker + '\n' + message})

    def sync(self, comments, cutoff):
        self.recover()
        value = self.load()
        for listed in sorted(comments, key=lambda x: x.get('id', 0)):
            text = instruction(listed)
            key = str(listed.get('id'))
            match = re.fullmatch(r'https://api.github.com/repos/chronoll/homupe/issues/([1-9][0-9]*)', listed.get('issue_url', ''))
            if not text or key in value['commands'] or not match or listed['created_at'] < cutoff:
                continue
            pr_number = int(match.group(1))
            current = self.github.get('issues/comments/' + key)
            if (instruction(current) != text or any(current.get(k) != listed.get(k)
                    for k in ('id', 'body', 'created_at', 'updated_at', 'issue_url'))
                    or current.get('user', {}).get('id') != listed.get('user', {}).get('id')):
                continue
            target = self.github.issue(pr_number)
            if 'pull_request' not in target:
                continue
            pr = self.github.get('pulls/' + str(pr_number))
            branch = pr.get('head', {}).get('ref', '')
            owned = re.fullmatch(r'factory/issue-([1-9][0-9]*)', branch)
            if not owned:
                continue
            revision = {'issue': int(owned.group(1)), 'pr': pr_number,
                'head_sha': pr.get('head', {}).get('sha'), 'comment_id': current['id'],
                'instructions': text}
            try:
                self.validate(revision)
            except Halt:
                continue
            record = {'comment_id': current['id'], 'pr': pr_number, 'issue': revision['issue'],
                      'status': 'claimed', 'body_sha': hashlib.sha256(current['body'].encode()).hexdigest()}
            value['commands'][key] = record
            atomic_json(self.path, value)  # Claim before archiving or queueing.
            try:
                # A new explicit instruction accepts the PR's current head,
                # including human conflict resolution. It is inherited, fully
                # verified and reviewed; a retry keeps its old frozen head.
                self.queue(revision, fresh_request=True)
                record.update(status='done', message='修正指示を受け付けました。現在のPRを引き継いで修正・検証・レビューし、同じPRを更新します。今の操作は不要です。')
            except RevisionQueueStopped:
                record.update(status='failed', message='監視キューがSTOP中のため、この修正指示は開始しませんでした。停止を続ける場合は操作不要です。再開する場合は元のIssue #%s に新しいコメントで /factory resume を送り、受付返信を確認してから、このPRに新しい /factory fix と修正内容を送ってください。このコメントは再実行しません。' % revision['issue'])
            except (Halt, OSError, KeyError, ValueError):
                # A failure after the durable queued commit (for example label
                # projection) does not mean the instruction was rejected.
                job = self.store.job(revision['issue'])
                queued = False
                try:
                    state = parse_json((job / 'state.json').read_bytes())
                    saved = parse_json((job / 'revision.json').read_bytes())
                    queued = (state.get('phase') == 'revision-queued'
                              and saved == revision)
                except (Halt, OSError, ValueError):
                    pass
                if queued:
                    record.update(status='done', message='修正指示の受付記録を保存しました。実行準備の復旧結果を照合しています。今は再送せず、元のIssue #%s の状態更新をお待ちください。' % revision['issue'])
                else:
                    record.update(status='failed', message='修正指示を開始できませんでした。PRが処理中、更新済み、または元のIssueが停止しています。Issueの状態を確認し、処理完了後に新しい指示を送ってください。')
            atomic_json(self.path, value)
        for record in value['commands'].values():
            try:
                self._receipt(record)
            except (Halt, OSError, ValueError, KeyError):
                pass  # One undeliverable receipt must not block the worker.
        try:
            self.help()
        except (Halt, OSError, ValueError, KeyError):
            pass  # Public help is optional and retried without replaying work.

    def help(self):
        for job in (self.store.root / 'jobs').glob('*'):
            if not re.fullmatch(r'[1-9][0-9]*', job.name) or not (job / 'state.json').exists():
                continue
            state = parse_json((job / 'state.json').read_bytes())
            match = re.fullmatch(r'https://github.com/chronoll/homupe/pull/([1-9][0-9]*)', state.get('url', ''))
            if state.get('phase') != 'draft-pr' or not match:
                continue
            number = int(match.group(1))
            try:
                self.validate({'issue': int(job.name), 'pr': number,
                               'head_sha': state.get('head_sha')})
            except Halt:
                continue  # Do not advertise controls on closed or stale PRs.
            comments = self.github.pages('issues/%s/comments?per_page=100' % number)
            if any(x.get('user', {}).get('login') == 'chronoll' and x.get('body', '').startswith(HELP_MARKER) for x in comments):
                continue
            self.github.write('issues/%s/comments' % number, {'body': HELP_MARKER + '\n'
                '変更内容・Checks・Previewを確認してください。追加修正が必要なら、このPRに新しいコメントを送ってください。\n\n'
                '```text\n/factory fix\nここに直してほしい内容を書く\n```\n\n'
                'この指示を受け付けると、同じPRを修正・再検証して再びDraftにします。自動マージ・本番反映はしません。'})
