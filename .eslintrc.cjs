/** @type {import("eslint").Linter.Config} */
const config = {
	parser: "@typescript-eslint/parser",
	parserOptions: {
		project: true,
	},
	plugins: ["@typescript-eslint", "unused-imports"],
	extends: [
		"plugin:@typescript-eslint/recommended-type-checked",
		"plugin:@typescript-eslint/stylistic-type-checked",
	],

	ignorePatterns: [
		".eslintrc.cjs",
		"prettier.config.mjs",
		"scripts/**/*",
		"*.js",
		"*.json",
		"*.md",
		"*.cjs",
		"drizzle/**/*",
		"drizzle.config.ts",
		"prisma/**/*",
		"client/**/*",
	],

	rules: {
		// These opinionated rules are enabled in stylistic-type-checked above.
		// Feel free to reconfigure them to your own preference.

		"@typescript-eslint/array-type": "off",

		"@typescript-eslint/consistent-type-definitions": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
		"@typescript-eslint/no-unsafe-return": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-explicit-any": "off",
		"@typescript-eslint/no-misused-promises": "off",
		"unused-imports/no-unused-imports": "off",
		"unused-imports/no-unused-vars": [
			"off",
			{
				vars: "all",
				varsIgnorePattern: "^_",
				args: "after-used",
				argsIgnorePattern: "^_",
			},
		],
		"@typescript-eslint/consistent-type-imports": [
			"warn",
			{
				prefer: "type-imports",
				fixStyle: "inline-type-imports",
			},
		],
		"@typescript-eslint/no-unused-vars": [
			"off",
			{ argsIgnorePattern: "^_" },
		],
	},
}

module.exports = config
