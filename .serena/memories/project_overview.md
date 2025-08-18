# Project Overview

## Project Name
Retro Homepage

## Purpose
A personal homepage application with multiple features including:
- Task management system with timer functionality
- Blog section  
- Book tracking
- Bulletin board system (BBS)
- Visitor counter

## Tech Stack
- **Framework**: Next.js 15.4.4 with TypeScript
- **UI Library**: Mantine v8 (UI components library)
- **Icons**: Tabler Icons React
- **Styling**: Tailwind CSS v4 with PostCSS
- **Database**: Redis (using ioredis client)
- **Testing**: Jest with React Testing Library
- **Runtime**: Node.js

## Key Features
1. **Task Management System**
   - Create, update, delete tasks
   - Category organization
   - Timer functionality with start/stop
   - Target time and deadline tracking
   - Drag & drop for reordering tasks
   - Completed tasks section

2. **Blog Section**
   - Blog listing with custom CSS modules

3. **Books Section**
   - Book tracking functionality

4. **BBS Board**
   - Bulletin board system for messages

5. **Visitor Counter**
   - Tracks and displays visitor count using Redis

## Project Structure
- `/src/app` - Next.js app router pages and API routes
- `/src/components` - React components
- `/src/lib` - Utilities, types, and repository pattern
- `/src/lib/repositories` - Data access layer with Redis
- `/public` - Static assets

## Development Mode
Uses Next.js with Turbopack for fast development builds.