import Image from "next/image";
import Link from "next/link";

interface Book {
  id: number;
  title: string;
  author: string;
  coverUrl: string;
  rating: number;
  review: string;
  readDate: string;
}

const books: Book[] = [
  {
    id: 1,
    title: "人間失格",
    author: "太宰治",
    coverUrl: "https://images-na.ssl-images-amazon.com/images/I/51r6dOvvJNL._SX344_BO1,204,203,200_.jpg",
    rating: 5,
    review: "人間の弱さと孤独を深く描いた作品。何度読んでも新しい発見がある。",
    readDate: "2024年12月"
  },
  {
    id: 2,
    title: "1984年",
    author: "ジョージ・オーウェル",
    coverUrl: "https://images-na.ssl-images-amazon.com/images/I/41aM4xOZxaL._SX277_BO1,204,203,200_.jpg",
    rating: 5,
    review: "監視社会の恐ろしさを描いたディストピア小説。現代にも通じる警鐘。",
    readDate: "2024年11月"
  },
  {
    id: 3,
    title: "こころ",
    author: "夏目漱石",
    coverUrl: "https://images-na.ssl-images-amazon.com/images/I/51ZP8mN2LGL._SX348_BO1,204,203,200_.jpg",
    rating: 4,
    review: "人間の心の機微を繊細に描いた名作。先生とKの関係が印象的。",
    readDate: "2024年10月"
  },
  {
    id: 4,
    title: "ノルウェイの森",
    author: "村上春樹",
    coverUrl: "https://images-na.ssl-images-amazon.com/images/I/41FjFQBpjTL._SX355_BO1,204,203,200_.jpg",
    rating: 4,
    review: "青春の喪失感と孤独を美しく描いた作品。音楽と共に読みたい。",
    readDate: "2024年9月"
  },
  {
    id: 5,
    title: "罪と罰",
    author: "ドストエフスキー",
    coverUrl: "https://images-na.ssl-images-amazon.com/images/I/51VJN9GK5ZL._SX349_BO1,204,203,200_.jpg",
    rating: 5,
    review: "人間の良心と罪の意識を深く掘り下げた傑作。心理描写が圧巻。",
    readDate: "2024年8月"
  },
  {
    id: 6,
    title: "銀河鉄道の夜",
    author: "宮沢賢治",
    coverUrl: "https://images-na.ssl-images-amazon.com/images/I/51Y9ZMTB3RL._SX351_BO1,204,203,200_.jpg",
    rating: 5,
    review: "幻想的で美しい物語。ジョバンニとカムパネルラの友情に心打たれる。",
    readDate: "2024年7月"
  }
];

export default function BooksPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* ヘッダー */}
      <div className="retro-border" style={{ marginBottom: '20px', padding: '15px', textAlign: 'center' }}>
        <h1 className="heisei-title" style={{
          fontSize: '28px',
          color: '#ff1493',
          textShadow: '2px 2px 4px #808080',
          margin: '0 0 10px 0'
        }}>
          ☆ 私の本棚 ☆
        </h1>
        <p style={{ fontSize: '16px', color: '#ff6347' }}>
          読んだ本の記録と感想
        </p>
      </div>

      {/* ナビゲーション */}
      <div className="retro-border" style={{ marginBottom: '20px', padding: '10px', textAlign: 'center' }}>
        <Link href="/" style={{ marginRight: '20px' }}>← ホームに戻る</Link>
        <Link href="/tasks">タスク管理 →</Link>
      </div>

      {/* 本のリスト */}
      <div className="retro-border" style={{ padding: '20px' }}>
        <h2 className="heisei-title" style={{
          fontSize: '20px',
          color: '#4169e1',
          borderBottom: '2px solid #4169e1',
          paddingBottom: '5px',
          marginBottom: '20px'
        }}>
          ◆ 読書記録 ◆
        </h2>

        <div style={{ display: 'grid', gap: '20px' }}>
          {books.map((book) => (
            <div key={book.id} className="retro-inset" style={{ padding: '15px' }}>
              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                {/* 本の表紙 */}
                <div style={{ flexShrink: 0 }}>
                  <Image
                    src={book.coverUrl}
                    alt={`${book.title}の表紙`}
                    width={120}
                    height={180}
                    style={{
                      objectFit: 'cover',
                      border: '2px solid #c0c0c0',
                      boxShadow: '2px 2px 4px #808080'
                    }}
                    unoptimized
                  />
                </div>

                {/* 本の情報 */}
                <div style={{ flex: 1, minWidth: '250px' }}>
                  <h3 className="heisei-title" style={{
                    fontSize: '18px',
                    color: '#ff4500',
                    marginBottom: '5px'
                  }}>
                    {book.title}
                  </h3>
                  <p style={{ marginBottom: '5px', color: '#666' }}>
                    著者: {book.author}
                  </p>
                  <p style={{ marginBottom: '10px', fontSize: '14px', color: '#888' }}>
                    読了: {book.readDate}
                  </p>
                  
                  {/* 評価 */}
                  <div style={{ marginBottom: '10px' }}>
                    評価: {Array(5).fill(0).map((_, i) => (
                      <span key={i} style={{ color: i < book.rating ? '#ff69b4' : '#ccc' }}>
                        ★
                      </span>
                    ))}
                  </div>

                  {/* レビュー */}
                  <div className="retro-inset" style={{ 
                    padding: '10px',
                    backgroundColor: '#f8f8f8',
                    fontSize: '14px',
                    lineHeight: '1.6'
                  }}>
                    {book.review}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* フッター */}
      <div className="retro-border" style={{ marginTop: '20px', padding: '15px', textAlign: 'center' }}>
        <p style={{ fontSize: '14px', margin: '0 0 10px 0' }}>
          ☆ 読書は心の栄養 ☆
        </p>
        <p style={{ fontSize: '12px', color: '#666', margin: '0' }}>
          © 2025 chronoll. All rights reserved.
        </p>
      </div>
    </div>
  );
}