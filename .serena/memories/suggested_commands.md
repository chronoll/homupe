# Suggested Commands

## Development
- `npm run dev` - Start development server with Turbopack (http://localhost:3000)
- `npm run build` - Build production bundle
- `npm start` - Start production server

## Code Quality
- `npm run lint` - Run ESLint for code linting (Next.js rules)
- `npm test` - Run Jest test suite

## Package Management
- `npm install` - Install dependencies
- `npm install <package>` - Add new dependency
- `npm install -D <package>` - Add dev dependency

## Git Commands (Darwin/macOS)
- `git status` - Check current changes
- `git add .` - Stage all changes
- `git commit -m "message"` - Commit changes
- `git push` - Push to remote
- `git pull` - Pull latest changes
- `git branch` - List branches
- `git checkout -b <branch>` - Create new branch

## System Utilities (macOS)
- `ls -la` - List files with details
- `cd <directory>` - Change directory
- `grep -r "pattern" .` - Search for pattern
- `find . -name "*.tsx"` - Find files by name
- `open .` - Open directory in Finder
- `cat <file>` - Display file contents
- `mkdir <directory>` - Create directory

## Redis (if needed locally)
- `redis-cli` - Open Redis CLI
- `redis-server` - Start Redis server

## Next.js Specific
- Files in `/app` directory are automatically routed
- API routes go in `/app/api` directory
- Use `page.tsx` for page components
- Use `route.ts` for API endpoints