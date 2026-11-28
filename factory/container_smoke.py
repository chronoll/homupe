"""CI-only, credential-free check of the real container and verification path."""
import base64
import json
from pathlib import Path
import shutil
import tempfile

from factory.core import Runner, Store, git, parse_json
from factory.dispatcher import config_at, snapshot
from factory.runtime import CODEX_MODEL, DISABLED_FEATURES, DockerRuntime, codex_settings


def main():
    repo = Path.cwd()
    with tempfile.TemporaryDirectory(prefix="homupe-factory-smoke-") as temp:
        root = Path(temp)
        work = root / "workspace"
        runner = Runner(Store(root / "state"))
        snapshot(runner, repo, git(runner, repo, "rev-parse", "HEAD"), work, root / "source.tar")
        runtime = DockerRuntime(config_at(repo), runner)
        runtime.pin_image(parse_json(runner.run(["docker", "image", "inspect", runtime.image])))
        evidence = root / "evidence"
        evidence.mkdir()
        (evidence / "readonly.txt").write_text("review evidence\n")
        (evidence / "screenshots").mkdir()
        (evidence / "screenshots" / "probe.png").write_bytes(base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yRZkAAAAASUVORK5CYII="))
        # No AI homes mounted. Exercise read-only source/root and absence of all
        # credential entry points without reading secrets or contacting providers.
        probe = """import os,pathlib,shutil
assert not pathlib.Path('/workspace/.git').exists()
assert not pathlib.Path('/var/run/docker.sock').exists()
assert not pathlib.Path('/home/node/.config/gh').exists()
assert shutil.which('codex'), 'Codex CLI is missing'
assert shutil.which('claude') is None, 'Codex-only runtime still depends on Claude'
assert not any(os.environ.get(k) for k in ['OPENAI_API_KEY','CODEX_API_KEY','ANTHROPIC_API_KEY'])
assert os.environ['GH_TOKEN']=='factory-disabled'
pathlib.Path('/tmp/factory-probe').write_text('ephemeral writes work')
# Both paths belong to the mapped runtime user; permissions alone would allow
# writes, so failures prove the read-only bind/root rather than Unix ownership.
for path in ['/workspace/README.md','/opt/browsers/factory-probe','/evidence/readonly.txt']:
 try:
  pathlib.Path(path).write_text('must fail')
 except OSError:
  pass
 else:
  raise AssertionError('read-only boundary failed: '+path)
print('container boundaries verified')
"""
        print(runtime.call(work, ["python3", "-c", probe], evidence=evidence,
                           readonly=True, network=False), flush=True)
        print(runtime.call(work, ["codex", "--version"], readonly=True, network=False, combine=True), flush=True)
        write_probe = """import pathlib
path=pathlib.Path('/workspace/factory-smoke-source-probe')
path.write_text('implementation can edit source')
assert path.read_text()=='implementation can edit source'
path.unlink()
print('implementation source writes verified')
"""
        print(runtime.call(work, ["python3", "-c", write_probe], network=False), flush=True)
        catalog_probe = """import json,pathlib,stat,sys
path=pathlib.Path('/opt/factory-model-catalog.json')
catalog=json.loads(path.read_text())
assert set(catalog)=={'models'},catalog.keys()
assert len(catalog['models'])==1
model=catalog['models'][0]
assert model['slug']==sys.argv[1],model['slug']
assert model['apply_patch_tool_type'] is None
assert model['experimental_supported_tools']==[]
assert 'model_messages' not in model and 'privacy' not in model
assert not stat.S_IMODE(path.stat().st_mode)&0o222
try:
 path.write_text('must not replace the factory catalog')
except OSError:
 pass
else:
 raise AssertionError('factory model catalog is writable')
print('Pinned image-owned model catalog disables built-in file tools')
"""
        print(runtime.call(work, ["python3", "-c", catalog_probe, CODEX_MODEL],
                           readonly=True, network=False), flush=True)
        catalog_rpc_probe = """import json,os,pathlib,select,subprocess,sys,tempfile,time
pathlib.Path('/home/node/.codex').mkdir()
assert not pathlib.Path('/home/node/.codex/auth.json').exists()
settings,model=json.loads(sys.argv[1]),sys.argv[2]
def listing(overrides):
 with tempfile.TemporaryFile() as errors:
  process=subprocess.Popen(['codex',*overrides,'app-server','--strict-config','--listen','stdio://'],
    cwd='/tmp',stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=errors)
  pending=b''
  def send(message):
   process.stdin.write((json.dumps(message)+'\\n').encode());process.stdin.flush()
  def receive(ident):
   nonlocal pending
   deadline=time.monotonic()+15
   while time.monotonic()<deadline:
    while b'\\n' in pending:
     line,pending=pending.split(b'\\n',1)
     message=json.loads(line)
     if message.get('id')==ident:return message
    if process.poll() is not None:
     errors.seek(0);raise RuntimeError(errors.read().decode()[-4000:])
    readable,_,_=select.select([process.stdout],[],[],min(.2,max(0,deadline-time.monotonic())))
    if readable:
     chunk=os.read(process.stdout.fileno(),65536)
     if chunk:pending+=chunk
   errors.seek(0);raise AssertionError('app-server catalog timeout: '+errors.read().decode()[-4000:])
  try:
   send({'id':1,'method':'initialize','params':{'clientInfo':{'name':'factory-smoke','version':'1'},'capabilities':{}}})
   initialized=receive(1)
   assert 'result' in initialized,initialized
   send({'method':'initialized','params':{}})
   # Listing only: never create a thread or start a model turn.
   send({'id':2,'method':'model/list','params':{'limit':100,'includeHidden':True}})
   return receive(2)
  finally:
   process.terminate()
   try:process.wait(timeout=3)
   except subprocess.TimeoutExpired:process.kill();process.wait()
response=listing(settings)
assert 'result' in response,response
assert [(entry['id'],entry['model']) for entry in response['result']['data']]==[(model,model)],response
assert response['result']['nextCursor'] is None,response
pathlib.Path('/tmp/factory-invalid-catalog.json').write_text(json.dumps({'models':[{'slug':model}]}))
invalid=[value if not value.startswith('model_catalog_json=') else
         'model_catalog_json="/tmp/factory-invalid-catalog.json"' for value in settings]
try:
 rejected=listing(invalid)
except RuntimeError as error:
 message=str(error)
else:
 assert 'error' in rejected,('invalid catalog silently fell back',rejected)
 message=json.dumps(rejected['error'])
assert 'missing field' in message,message
print('Codex typed model/list accepts only the pinned catalog and rejects malformed metadata without auth or network')
"""
        print(runtime.call(work, ["python3", "-c", catalog_rpc_probe, json.dumps(codex_settings()), CODEX_MODEL],
                           readonly=True, network=False, timeout=60), flush=True)
        # Deliberately absent output schema stops exec before auth, MCP startup,
        # or any model request. A bad-key control proves strict validation ran.
        # The whole probe also has no network and no AI authentication volumes.
        config_probe = """import json,pathlib,subprocess,sys
pathlib.Path('/home/node/.codex').mkdir()
assert not pathlib.Path('/home/node/.codex/auth.json').exists()
settings,disabled=json.loads(sys.argv[1]),json.loads(sys.argv[2])
base=['codex','exec','--strict-config','--ignore-user-config','--ignore-rules',
      '--ephemeral','--sandbox','danger-full-access','--skip-git-repo-check',
      *settings,'--output-schema','/tmp/factory-absent-schema.json']
valid=subprocess.run([*base,'-'],input='offline configuration validation',capture_output=True,text=True,timeout=15)
assert valid.returncode!=0
assert 'Failed to read output schema file /tmp/factory-absent-schema.json' in valid.stderr,valid.stderr
invalid=subprocess.run([*base,'-c','factory_unknown_setting=true','-'],
                       input='offline configuration validation',capture_output=True,text=True,timeout=15)
assert invalid.returncode!=0
assert 'unknown configuration field `factory_unknown_setting`' in invalid.stderr,invalid.stderr
features=subprocess.run(['codex',*settings,'features','list'],capture_output=True,text=True,timeout=15)
assert features.returncode==0,features.stderr
states={line.split()[0]:line.split()[-1] for line in features.stdout.splitlines() if line.strip()}
for feature in disabled:
 assert states.get(feature)=='false',(feature,states.get(feature))
print('Codex strict config, negative control, and disabled capabilities verified without auth or network')
"""
        for writable in (False, True):
            print(runtime.call(work, ["python3", "-c", config_probe, json.dumps(codex_settings(writable)),
                                     json.dumps(DISABLED_FEATURES)],
                               readonly=True, network=False, timeout=60), flush=True)
        protocol_probe = """import base64,hashlib,json,pathlib,subprocess,sys
assert not pathlib.Path('/home/node/.codex/auth.json').exists()
writable=sys.argv[1]=='write'
target=pathlib.Path('/workspace/factory-smoke-write.txt')
assert not target.exists()
text='bounded implementation source edit'
digest=hashlib.sha256(text.encode()).hexdigest()
requests=[
 {'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'factory-smoke','version':'1'}}},
 {'jsonrpc':'2.0','method':'notifications/initialized'},
 {'jsonrpc':'2.0','id':2,'method':'tools/list'},
 {'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'read_file','arguments':{'root':'source','path':'README.md','start_line':1,'line_count':2}}},
 {'jsonrpc':'2.0','id':4,'method':'tools/call','params':{'name':'read_file','arguments':{'root':'evidence','path':'readonly.txt'}}},
 {'jsonrpc':'2.0','id':5,'method':'tools/call','params':{'name':'read_file','arguments':{'root':'source','path':'/home/node/.codex/auth.json'}}},
 {'jsonrpc':'2.0','id':6,'method':'tools/call','params':{'name':'read_file','arguments':{'root':'source','path':'../home/node/.codex/auth.json'}}},
 {'jsonrpc':'2.0','id':7,'method':'tools/call','params':{'name':'exec','arguments':{'command':'touch /tmp/must-not-execute'}}},
 {'jsonrpc':'2.0','id':8,'method':'tools/call','params':{'name':'write_file','arguments':{'path':'factory-smoke-write.txt','content':text,'expected_sha256':None}}},
 {'jsonrpc':'2.0','id':15,'method':'tools/call','params':{'name':'read_image','arguments':{'path':'screenshots/probe.png'}}},
 {'jsonrpc':'2.0','id':16,'method':'tools/call','params':{'name':'read_image','arguments':{'path':'/home/node/.codex/auth.json'}}},
]
if writable:
 requests.extend([
  {'jsonrpc':'2.0','id':9,'method':'tools/call','params':{'name':'read_file','arguments':{'path':'factory-smoke-write.txt'}}},
  {'jsonrpc':'2.0','id':10,'method':'tools/call','params':{'name':'write_file','arguments':{'path':'factory-smoke-write.txt','content':'stale edit','expected_sha256':'0'*64}}},
  {'jsonrpc':'2.0','id':11,'method':'tools/call','params':{'name':'write_file','arguments':{'path':'.factory/config.json','content':'must fail','expected_sha256':None}}},
  {'jsonrpc':'2.0','id':12,'method':'tools/call','params':{'name':'write_file','arguments':{'path':'/home/node/.codex/auth.json','content':'must fail','expected_sha256':None}}},
  {'jsonrpc':'2.0','id':13,'method':'tools/call','params':{'name':'write_file','arguments':{'root':'evidence','path':'readonly.txt','content':'must fail','expected_sha256':None}}},
  {'jsonrpc':'2.0','id':14,'method':'tools/call','params':{'name':'delete_file','arguments':{'path':'factory-smoke-write.txt','expected_sha256':digest}}},
 ])
command=['/usr/bin/python3','-I','/opt/factory-read-tools.py']+(['--allow-write'] if writable else [])
result=subprocess.run(command,
 input=''.join(json.dumps(request)+'\\n' for request in requests),capture_output=True,text=True,timeout=15)
assert result.returncode==0,result.stderr
responses={response['id']:response for response in map(json.loads,result.stdout.splitlines())}
assert set(responses)==set(range(1,15 if writable else 9))|{15,16},responses
assert responses[1]['result']['protocolVersion']=='2024-11-05'
tools=responses[2]['result']['tools']
read_tools={'list_files','read_file','search','read_image'}
assert {tool['name'] for tool in tools}==read_tools|({'write_file','delete_file'} if writable else set())
assert all(tool['annotations']['readOnlyHint'] for tool in tools if tool['name'] in read_tools)
for ident in (3,4):
 assert responses[ident]['result']['isError'] is False,responses[ident]
 content=json.loads(responses[ident]['result']['content'][0]['text'])
 assert content['lines'],content
for ident in (5,6,7):
 assert responses[ident]['result']['isError'] is True,responses[ident]
if writable:
 for ident in (8,9,14):
  assert responses[ident]['result']['isError'] is False,responses[ident]
 written=json.loads(responses[9]['result']['content'][0]['text'])
 assert written['sha256']==digest,written
 assert written['lines']==[{'line':1,'text':text}],written
 for ident in (10,11,12,13):
  assert responses[ident]['result']['isError'] is True,responses[ident]
else:
 assert responses[8]['result']['isError'] is True,responses[8]
assert not pathlib.Path('/tmp/must-not-execute').exists()
assert not target.exists()
assert pathlib.Path('/evidence/readonly.txt').read_text()=='review evidence\\n'
image=responses[15]['result']['content'][0]
assert responses[15]['result']['isError'] is False,responses[15]
assert image['type']=='image' and image['mimeType']=='image/png',image
assert base64.b64decode(image['data'])==pathlib.Path('/evidence/screenshots/probe.png').read_bytes()
assert responses[16]['result']['isError'] is True,responses[16]
print('Fixed MCP read/write protocol verified; readonly='+str(not writable))
"""
        for writable in (False, True):
            print(runtime.call(work, ["python3", "-c", protocol_probe, "write" if writable else "read"],
                               evidence=evidence, readonly=not writable, network=False, timeout=30), flush=True)
        try:
            runtime.verify(work, runtime.config["verify"], root)
        finally:
            results = repo / "factory-container-results"
            results.mkdir(exist_ok=True)
            for log in root.glob("verify-*.log"):
                shutil.copyfile(log, results / log.name)
                print(log.name + ":\n" + log.read_text(errors="replace")[-16000:], flush=True)
            for directory in ("test-results", "playwright-report"):
                if (work / directory).exists():
                    shutil.copytree(work / directory, results / directory, dirs_exist_ok=True)
        print("Container lint/types/unit, fixture build and desktop/mobile E2E passed.", flush=True)


if __name__ == "__main__":
    main()
