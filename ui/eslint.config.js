// @ts-check
// Same setup as the other dashboards (angular-eslint, recommended + accessibility). Run: npm run lint
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

// selector prefixes in use: the app shell and one per feature/shared area
const prefixes = ["app", "media", "browse", "folder", "folders", "subtype", "subtypes", "stats", "chip", "list", "item", "viewer", "review"];

module.exports = tseslint.config(
  { ignores: ["src/app/core/api-types.ts"] },   // generated (npm run gen:api)
  {
    files: ["**/*.ts"],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended, ...tseslint.configs.stylistic, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": ["error", { type: "attribute", prefix: prefixes, style: "camelCase" }],
      "@angular-eslint/component-selector": ["error", { type: "element", prefix: prefixes, style: "kebab-case" }],
    },
  },
  {
    files: ["**/*.html"],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  }
);
