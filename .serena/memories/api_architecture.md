# API Architecture

## API Routes Structure
Located in `/src/app/api/` using Next.js App Router conventions.

## Current API Endpoints

### Task Management
- `GET/POST /api/tasks` - List all tasks or create new task
- `GET/PUT/DELETE /api/tasks/[id]` - Get, update, or delete specific task  
- `POST /api/tasks/[id]/complete` - Mark task as complete
- `POST /api/tasks/[id]/timer/start` - Start task timer
- `POST /api/tasks/[id]/timer/stop` - Stop task timer
- `POST /api/tasks/auth` - Authentication endpoint

### Categories
- `GET/POST /api/categories` - List categories or create new

### Other Features
- `GET /api/visitor-count` - Get/increment visitor count
- `GET/POST /api/bbs` - Bulletin board messages
- `GET /api/test-redis` - Redis connection test

## Data Storage
Uses Redis for persistence with repository pattern:
- `taskRepository.ts` - Task CRUD operations
- `categoryRepository.ts` - Category management  
- `timerRepository.ts` - Timer state management

## Response Format
- Success: Return JSON data with appropriate status
- Error: Return error message with 4xx/5xx status
- Use try-catch for error handling

## Authentication
Basic auth implementation in `/api/tasks/auth` route.

## Redis Key Patterns
- Tasks: `task:{id}`
- Categories: `category:{id}` 
- Lists: `tasks`, `categories`
- Visitor count: `visitor_count`

## Next.js Route Handler Pattern
```typescript
export async function GET(request: Request) {
  // Handle GET requests
}

export async function POST(request: Request) {
  // Handle POST requests
}
```