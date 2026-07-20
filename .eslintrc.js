module.exports = {
  root: true,
  extends: ['next/core-web-vitals'],
  plugins: ['@typescript-eslint'],
  rules: {
    // These two are the real backbone of the "271 `: any` / 100 `as any`"
    // finding in the readiness report. Setting them to 'error' immediately
    // would break the build on ~370 pre-existing sites we haven't fixed yet.
    // 'warn' means: nothing NEW regresses silently (CI still shows every
    // warning in the PR diff), and this is the mechanical first step before
    // ratcheting to 'error' once the backlog is paid down.
    //
    // To ratchet up: change 'warn' -> 'error' below, run `npm run lint`,
    // and fix routes/files as they come up red. Recommend doing this
    // file-by-file (or directory-by-directory) rather than all at once.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // Same ratchet logic — 219 raw console.error calls exist today (see
    // CHANGES.md). Not blocking the build on this yet; it flags every NEW
    // console.* call in a PR diff so the count doesn't keep growing.
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
