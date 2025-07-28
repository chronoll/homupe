import Image from "next/image";

// 静的生成でパフォーマンス向上
export const dynamic = 'force-static';

export default function Home() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* ヘッダー */}
      <div className="retro-border" style={{ marginBottom: '20px', padding: '15px', textAlign: 'center' }}>
        <div className="header-icons" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <Image
            src="/images/gecko.png"
            alt="アイコン"
            width={60}
            height={60}
            style={{
              border: '2px solid #ff1493',
              borderRadius: '50%',
              boxShadow: '2px 2px 4px #808080'
            }}
          />
          <h1 style={{
            fontSize: '28px',
            color: '#ff1493',
            textShadow: '2px 2px 4px #808080',
            margin: '0'
          }}>
            🌸 ようこそ！私のホームページへ 🌸
          </h1>
          <Image
            src="/images/gecko.png"
            alt="アイコン"
            width={60}
            height={60}
            style={{
              border: '2px solid #ff1493',
              borderRadius: '50%',
              boxShadow: '2px 2px 4px #808080'
            }}
          />
        </div>
        <p className="blink" style={{ fontSize: '16px', color: '#ff6347', fontWeight: 'bold' }}>
          ★ ゆっくりしていってね ★
        </p>
      </div>

      {/* メインコンテンツ */}
      <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '20px' }}>

        {/* 左側：メインコンテンツ */}
        <div>
          {/* プロフィール */}
          <div className="retro-border" style={{ marginBottom: '20px', padding: '15px' }}>
            <h2 style={{
              fontSize: '20px',
              color: '#4169e1',
              borderBottom: '2px solid #4169e1',
              paddingBottom: '5px',
              marginBottom: '15px'
            }}>
              💫 プロフィール 💫
            </h2>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flexShrink: 0 }}>
                <Image
                  src="/images/IMG_1453.PNG"
                  alt="プロフィール画像"
                  width={100}
                  height={100}
                  style={{ objectFit: 'cover' }}
                />
              </div>

              {/* プロフィール情報 */}
              <div style={{ flex: 1, minWidth: '200px' }}>
                <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 'bold', width: '80px' }}>なまえ</td>
                      <td>クロタカ</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 'bold' }}>おしごと</td>
                      <td>エンジニア</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 'bold' }}>すまい</td>
                      <td>東京</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 最新情報 */}
          <div className="retro-border" style={{ marginBottom: '20px', padding: '15px' }}>
            <h2 style={{
              fontSize: '20px',
              color: '#32cd32',
              borderBottom: '2px solid #32cd32',
              paddingBottom: '5px',
              marginBottom: '15px'
            }}>
              🆕 最新情報 🆕
            </h2>
            <div className="retro-inset">
              <p><strong>2025/04/01</strong> - 社会に出る</p>
              <p><strong>2002/07/05</strong> - 山口県光市に生まれる</p>
            </div>
          </div>

          {/* 作品紹介 */}
          <div className="retro-border" style={{ marginBottom: '20px', padding: '15px' }}>
            <h2 style={{
              fontSize: '20px',
              color: '#ff4500',
              borderBottom: '2px solid #ff4500',
              paddingBottom: '5px',
              marginBottom: '15px'
            }}>
              🖼️ ギャラリー 🖼️
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px' }}>
              <Image
                src="/images/sunsun/1.jpg"
                alt="ギャラリー画像1"
                width={120}
                height={120}
                style={{ objectFit: 'cover', width: '100%', height: 'auto' }}
              />
              <Image
                src="/images/sunsun/2.JPG"
                alt="ギャラリー画像2"
                width={120}
                height={120}
                style={{ objectFit: 'cover', width: '100%', height: 'auto' }}
              />
            </div>
          </div>
        </div>

        {/* 右側：サイドバー */}
        <div>
          {/* リンク集 */}
          <div className="retro-border" style={{ marginBottom: '20px', padding: '15px' }}>
            <h3 style={{
              fontSize: '16px',
              color: '#8a2be2',
              borderBottom: '1px solid #8a2be2',
              paddingBottom: '5px',
              marginBottom: '10px'
            }}>
              🔗 リンク集
            </h3>
            <div style={{ fontSize: '14px', lineHeight: '1.8' }}>
              <p><a href="#blog">📝 ブログ</a></p>
              <p><a href="#gallery">🖼️ ギャラリー</a></p>
              <p><a href="#contact">📧 お問い合わせ</a></p>
              <p><a href="#about">ℹ️ このサイトについて</a></p>
            </div>
          </div>

          {/* カウンター */}
          <div className="retro-border" style={{ marginBottom: '20px', padding: '15px', textAlign: 'center' }}>
            <h3 style={{
              fontSize: '16px',
              color: '#dc143c',
              marginBottom: '10px'
            }}>
              👥 訪問者数
            </h3>
            <div className="retro-inset" style={{
              fontSize: '24px',
              fontFamily: 'Courier Prime, monospace',
              color: '#000080',
              fontWeight: 'bold'
            }}>
              000123
            </div>
            <p style={{ fontSize: '12px', marginTop: '5px' }}>あなたは123人目の訪問者です♪</p>
          </div>

          {/* 今日のコード */}
          <div className="retro-border" style={{ marginBottom: '20px', padding: '15px' }}>
            <h3 style={{
              fontSize: '16px',
              color: '#228b22',
              borderBottom: '1px solid #228b22',
              paddingBottom: '5px',
              marginBottom: '10px'
            }}>
              💻 今日のコード
            </h3>
            <div className="retro-inset" style={{
              fontSize: '12px',
              fontFamily: 'Courier Prime, monospace',
              backgroundColor: '#000',
              color: '#00ff00',
              padding: '8px',
              borderRadius: '4px'
            }}>
              console.log("Hello, Gecko!");
            </div>
          </div>

          {/* 天気 */}
          <div className="retro-border" style={{ padding: '15px' }}>
            <h3 style={{
              fontSize: '16px',
              color: '#4682b4',
              borderBottom: '1px solid #4682b4',
              paddingBottom: '5px',
              marginBottom: '10px'
            }}>
              🌤️ 今日の天気
            </h3>
            <div className="retro-inset" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '30px', marginBottom: '5px' }}>☀️</div>
              <p style={{ fontSize: '14px' }}>晴れ / 22°C</p>
            </div>
          </div>
        </div>
      </div>

      {/* フッター */}
      <div className="retro-border" style={{ marginTop: '20px', padding: '15px', textAlign: 'center' }}>
        <p style={{ fontSize: '14px', margin: '0 0 10px 0' }}>
          🌟 来てくれてありがとう 🌟
        </p>
        <p style={{
          fontSize: '12px',
          margin: '0 0 10px 0',
          color: '#ffffe5',
          opacity: 0.1
        }}>
          〜帰れ〜
        </p>
        <p style={{ fontSize: '12px', color: '#666', margin: '0' }}>
          © 2025 chronoll. All rights reserved.
        </p>
        <div style={{ marginTop: '10px' }}>
          <button className="retro-button" style={{ marginRight: '10px' }}>
            📧 メール
          </button>
          <button className="retro-button">
            🔄 更新
          </button>
        </div>
      </div>
    </div>
  );
}
