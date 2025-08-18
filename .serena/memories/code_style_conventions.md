# Code Style and Conventions

## TypeScript Configuration
- **Strict Mode**: Enabled
- **Target**: ES2017
- **Module**: ESNext with bundler resolution
- **Path Alias**: `@/*` maps to `./src/*`
- **JSX**: Preserve mode for Next.js

## Naming Conventions
- **Components**: PascalCase (e.g., `TaskModal`, `FloatingCreateButton`)
- **Files**: 
  - Components: PascalCase with `.tsx` extension
  - Pages: lowercase `page.tsx`
  - API routes: lowercase `route.ts`
  - Utilities: camelCase with `.ts` extension
- **Variables/Functions**: camelCase
- **Types/Interfaces**: PascalCase
- **Constants**: UPPER_SNAKE_CASE for true constants, or camelCase for configuration objects

## Code Patterns
- **Components**: Functional components with React hooks
- **Memoization**: Use `React.memo()` for performance optimization
- **Props**: Define interface with `Props` suffix (e.g., `TaskModalProps`)
- **State Management**: Local state with `useState`, no global state management library currently
- **API Routes**: RESTful conventions with Next.js route handlers
- **Data Access**: Repository pattern in `/lib/repositories`

## Type System
- All components and functions should have proper TypeScript types
- Interfaces are preferred over types for object shapes
- Optional properties use `?` notation
- Use `export interface` for shared types in `lib/types.ts`

## Import Style
- Use absolute imports with `@/` alias
- Group imports: React/Next first, then external libraries, then local imports
- Example:
  ```typescript
  import { useState, useEffect } from 'react';
  import { Modal, Button } from '@mantine/core';
  import { Task } from '@/lib/types';
  ```

## Component Structure
1. Interface/Type definitions
2. Component declaration with props destructuring
3. State declarations
4. Effects
5. Handler functions
6. Return JSX

## Styling
- Tailwind CSS for utility classes
- CSS Modules for component-specific styles (`.module.css`)
- Mantine components come with built-in styling

## Error Handling
- Use try-catch blocks in API routes
- Return appropriate HTTP status codes
- Handle loading and error states in components

## ESLint Configuration
- Extends Next.js Core Web Vitals rules
- TypeScript ESLint rules enabled