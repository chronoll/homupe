import BlogList from '@/components/BlogList';
import Link from 'next/link';

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <nav className="flex items-center justify-between">
            <Link href="/" className="text-slate-600 hover:text-slate-900 transition-colors">
              ← ホームへ戻る
            </Link>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Blog
            </h1>
            <div className="w-24"></div>
          </nav>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* ヒーローセクション */}
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-slate-900 mb-4">
            My Thoughts & Ideas
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            技術、デザイン、日々の発見について書いています
          </p>
        </div>

        {/* カテゴリータグ */}
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          <button className="px-4 py-2 bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 transition-colors">
            すべて
          </button>
          <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors">
            技術
          </button>
          <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors">
            デザイン
          </button>
          <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors">
            ライフスタイル
          </button>
        </div>

        {/* ブログ記事一覧 */}
        <BlogList />
      </main>

      {/* フッター */}
      <footer className="mt-24 border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-slate-600">
            © 2025 chronoll. Modern design with ❤️
          </p>
        </div>
      </footer>
    </div>
  );
}