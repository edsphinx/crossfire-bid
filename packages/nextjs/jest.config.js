// import nextJest from "next/jest";
/* eslint-disable */
const nextJest = require('next/jest.js');

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "node",
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/", "<rootDir>/tests/e2e/"],
  testMatch: ["<rootDir>/tests/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^~/(.*)$": "<rootDir>/$1",
  },

  // Uncomment and configure for code coverage reports
  // collectCoverageFrom: [
  //   './app/**/*.{ts,tsx}',
  //   '!./app/**/*.d.ts',
  //   '!./app/**/_app.tsx',
  //   '!./app/**/_document.tsx',
  // ],
  // coverageDirectory: 'coverage',
};

// createJestConfig is asynchronous to load Next.js config
module.exports = createJestConfig(customJestConfig);
