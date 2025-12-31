
export type UserID = 'user1' | 'user2';

export enum Frequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUAL = 'ANNUAL'
}

export enum Category {
  KITCHEN = 'KITCHEN',
  LIVING = 'LIVING',
  BEDROOMS = 'BEDROOMS',
  BATHROOMS = 'BATHROOMS',
  ENTRY = 'ENTRY',
  OUTDOOR = 'OUTDOOR',
  GENERAL = 'GENERAL',
  ADMIN = 'ADMIN'
}

export interface User {
  id: UserID;
  name: string;
  color: string;
  avatar: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  category: Category;
  frequency: Frequency;
  assignedTo: UserID[];
  completedBy: UserID[];
  isSOS: boolean;
  dueDate: string;
  isDone: boolean;
  completedAt?: string;
  lastResetAt: string; // Nouvelle date pour le suivi de latence
}

export interface LibraryTask {
  id: string;
  title: string;
  category: Category;
  suggestedFrequency: Frequency;
}

export type ViewType = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
export type MainNavType = 'DASHBOARD' | 'HISTORY' | 'ACTIVITIES' | 'SETTINGS';
export type Language = 'fr' | 'en';
