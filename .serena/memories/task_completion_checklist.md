# Task Completion Checklist

When completing any development task, ensure you:

## 1. Code Quality Checks
- [ ] Run `npm run lint` to check for linting errors
- [ ] Fix any ESLint warnings or errors
- [ ] Ensure no TypeScript errors (check with `npm run build`)

## 2. Testing
- [ ] Run `npm test` if tests exist for the modified code
- [ ] Add tests for new functionality if applicable
- [ ] Ensure all existing tests still pass

## 3. Build Verification
- [ ] Run `npm run build` to ensure production build works
- [ ] Check for any build warnings or errors
- [ ] Verify no unused imports or variables

## 4. Runtime Verification
- [ ] Test the feature in development mode (`npm run dev`)
- [ ] Check browser console for any errors
- [ ] Verify the UI renders correctly
- [ ] Test user interactions work as expected

## 5. Code Review Checklist
- [ ] Code follows existing patterns and conventions
- [ ] TypeScript types are properly defined
- [ ] No hardcoded values that should be constants
- [ ] Error handling is implemented where needed
- [ ] Component is properly memoized if needed for performance
- [ ] Imports use the `@/` alias consistently

## 6. Before Committing
- [ ] All console.log statements removed (unless intentional)
- [ ] No commented-out code left behind
- [ ] File naming follows project conventions
- [ ] API endpoints follow RESTful conventions

## Important Commands to Run
```bash
npm run lint    # Check code style
npm test        # Run tests
npm run build   # Verify production build
```

If any of these fail, fix the issues before considering the task complete.