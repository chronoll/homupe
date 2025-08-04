'use client';

import { useState } from 'react';
import Image from 'next/image';

interface BlogPost {
  id: number;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  readTime: string;
  image?: string;
}

const samplePosts: BlogPost[] = [
  {
    id: 1,
    title: "Next.js 14でアプリを作ってみた",
    excerpt: "最新のNext.jsを使って、パフォーマンスの高いWebアプリケーションを構築する方法について解説します。App Routerの使い方や、Server Componentsの活用法など。",
    date: "2025-01-04",
    category: "技術",
    readTime: "5分",
    image: "/images/sunsun/1.jpg"
  },
  {
    id: 2,
    title: "モダンなUIデザインのトレンド2025",
    excerpt: "2025年のWebデザイントレンドを紹介。グラスモーフィズム、ニューモーフィズム、そしてAIを活用したデザインプロセスについて。",
    date: "2025-01-02",
    category: "デザイン",
    readTime: "3分",
  },
  {
    id: 3,
    title: "エンジニアの朝活ルーティン",
    excerpt: "生産性を最大化するための朝のルーティンを公開。コーディングに集中するための環境作りと、効率的な学習方法について。",
    date: "2024-12-28",
    category: "ライフスタイル",
    readTime: "4分",
    image: "/images/sunsun/2.JPG"
  },
];

export default function BlogList() {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const getCategoryStyle = (category: string) => {
    switch (category) {
      case '技術':
        return 'bg-blue-100 text-blue-700';
      case 'デザイン':
        return 'bg-pink-100 text-pink-700';
      case 'ライフスタイル':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {samplePosts.map((post) => (
        <article
          key={post.id}
          className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1"
          onMouseEnter={() => setHoveredId(post.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          {/* サムネイル画像 */}
          <div className="relative h-48 bg-gradient-to-br from-purple-400 to-pink-400">
            {post.image ? (
              <Image
                src={post.image}
                alt={post.title}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-white text-4xl font-bold">
                {post.category[0]}
              </div>
            )}
            
            {/* 読了時間バッジ */}
            <div className="absolute top-4 right-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded-full text-sm">
              {post.readTime}
            </div>
          </div>

          {/* コンテンツ */}
          <div className="p-6">
            {/* カテゴリーと日付 */}
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${getCategoryStyle(post.category)}`}>
                {post.category}
              </span>
              <time className="text-sm text-gray-500">
                {new Date(post.date).toLocaleDateString('ja-JP')}
              </time>
            </div>

            {/* タイトル */}
            <h3 className="text-xl font-bold text-gray-800 mb-3 line-clamp-2 hover:text-purple-600 transition-colors">
              {post.title}
            </h3>

            {/* 概要 */}
            <p className="text-gray-600 text-sm line-clamp-3 mb-4">
              {post.excerpt}
            </p>

            {/* 続きを読むボタン */}
            <div className="flex items-center text-purple-600 font-semibold text-sm group">
              <span className="group-hover:mr-2 transition-all">続きを読む</span>
              <svg 
                className={`w-4 h-4 ml-1 transform transition-transform ${hoveredId === post.id ? 'translate-x-1' : ''}`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}