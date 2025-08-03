'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function TasksPage() {
  const [password, setPassword] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const auth = sessionStorage.getItem('tasksAuth')
    if (auth === 'true') {
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const response = await fetch('/api/tasks/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setIsAuthenticated(true)
        sessionStorage.setItem('tasksAuth', 'true')
      } else {
        alert('パスワードが違います')
      }
    } catch (error) {
      alert('エラーが発生しました')
    }
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-green-400">Loading...</div>
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg border-2 border-green-400">
          <h1 className="text-2xl font-bold text-green-400 mb-6 text-center">パスワードを入力してください</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 text-green-400 border border-green-400 rounded focus:outline-none focus:border-green-300"
              placeholder="パスワード"
              autoFocus
            />
            <button
              type="submit"
              className="w-full px-4 py-2 bg-green-400 text-gray-900 font-bold rounded hover:bg-green-300 transition-colors"
            >
              ログイン
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-green-400 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">タスク管理</h1>
        
        <div className="bg-gray-800 p-6 rounded-lg border-2 border-green-400 mb-8">
          <h2 className="text-2xl font-bold mb-4">今日のタスク</h2>
          <ul className="space-y-2">
            <li className="flex items-center">
              <input type="checkbox" className="mr-3" />
              <span>コードレビューを完了する</span>
            </li>
            <li className="flex items-center">
              <input type="checkbox" className="mr-3" />
              <span>ドキュメントを更新する</span>
            </li>
            <li className="flex items-center">
              <input type="checkbox" className="mr-3" />
              <span>テストコードを書く</span>
            </li>
          </ul>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border-2 border-green-400 mb-8">
          <h2 className="text-2xl font-bold mb-4">進行中のプロジェクト</h2>
          <div className="space-y-4">
            <div className="border-l-4 border-green-400 pl-4">
              <h3 className="font-bold">ウェブサイトリニューアル</h3>
              <p className="text-sm text-gray-400">進捗: 75%</p>
            </div>
            <div className="border-l-4 border-yellow-400 pl-4">
              <h3 className="font-bold">新機能開発</h3>
              <p className="text-sm text-gray-400">進捗: 30%</p>
            </div>
            <div className="border-l-4 border-red-400 pl-4">
              <h3 className="font-bold">バグ修正</h3>
              <p className="text-sm text-gray-400">進捗: 10%</p>
            </div>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={() => {
              sessionStorage.removeItem('tasksAuth')
              router.push('/')
            }}
            className="px-6 py-2 bg-red-600 text-white font-bold rounded hover:bg-red-700 transition-colors"
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  )
}