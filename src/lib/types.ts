export interface YouTubeVideo {
  id: string;
  title: string;
  channelName: string;
  channelUrl: string;
  thumbnailUrl: string;
}

export type BookStatus = "未読" | "読書中" | "読了";
export type BookCategory = "一般" | "技術書";

export interface Book {
  id: string;
  title: string;
  author: string;
  publisher: string;
  status: BookStatus;
  category: BookCategory;
  purchaseDate: string | null;
  finishDate: string | null;
  url: string | null;
  coverImageUrl: string | null;
}

export interface Recipe {
  id: string;
  title: string;
  lead: string;
  description: string;
  imageUrl: string;
  url: string;
  cookingTime: string | null;
  cookingCost: string | null;
  calorie: string | null;
  category: string | null;
}
