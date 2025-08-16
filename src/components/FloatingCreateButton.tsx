
import React from 'react';

interface FloatingCreateButtonProps {
  onClick: () => void;
}

const FloatingCreateButton: React.FC<FloatingCreateButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 left-4 bg-blue-600 hover:bg-blue-700 text-white text-2xl w-14 h-14 rounded-full shadow-lg flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-300 ease-in-out transform hover:scale-105"
      title="新しいタスクを作成"
    >
      +
    </button>
  );
};

export default FloatingCreateButton;
