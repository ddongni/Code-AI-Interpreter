# Code AI Interpreter

A VSCode extension that helps you understand code by translating it into human-readable explanations in your preferred language.

## What is this?

Code AI Interpreter automatically explains what your code does, block by block. It's like having a coding tutor right in your editor!

## Features

- **Block-by-Block Interpretation**: Press `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux) to interpret entire file by code blocks
- **Multiple Languages**: Get explanations in 15+ languages including English, Korean, Japanese, Chinese, and more

## Installation

1. Open VSCode
2. Go to Extensions (click the Extensions icon in the left sidebar, or press `Cmd+Shift+X` on Mac / `Ctrl+Shift+X` on Windows/Linux)
3. Search for "Code AI Interpreter"
4. Click the "Install" button
5. Wait for installation to complete

That's it! No additional setup needed.

## How to Use

### Method 1: Interpret Entire File by Blocks

This interprets your entire file, grouping code into logical blocks (functions, classes, if statements, etc.).

1. Open any code file
2. Press `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux)
3. Wait for the interpretation to complete (you'll see a progress notification)
4. Explanations will appear as comments below each code block:

```javascript
function calculateSum(a, b) {
  return a + b;
} // 💡 This function calculates and returns the sum of two numbers
```

## Change Language

You can get explanations in different languages:

1. Open VSCode Settings:
   - Mac: `Cmd+,`
   - Windows/Linux: `Ctrl+,`
2. Search for "Code AI Interpreter"
3. Find "Interpretation Language" setting
4. Select your preferred language from the dropdown
5. Explanations will automatically update to the selected language

**Supported Languages:**
English, Korean (한국어), Japanese (日本語), Chinese Simplified (简体中文), Chinese Traditional (繁體中文), Spanish (Español), French (Français), German (Deutsch), Portuguese (Português), Russian (Русский), Italian (Italiano), Arabic (العربية), Hindi (हिन्दी), Vietnamese (Tiếng Việt), Thai (ไทย)

## Tips

- **For large files**: The block interpretation method (`Cmd+R` / `Ctrl+R`) is efficient for understanding entire files
- **Best for learning**: Use block interpretation when reading unfamiliar code to understand the overall structure

## Troubleshooting

### Explanations are not showing

- Make sure you're in a code file (not a text file)
- Try saving the file (`Cmd+S` / `Ctrl+S`)
- Try restarting VSCode
- Make sure you pressed `Cmd+R` / `Ctrl+R` or used the command palette

### Interpretations are slow

- This is normal for large files - the extension processes code asynchronously
- Block interpretation processes all blocks in the file, so it may take time for large files
- Wait for the progress notification to complete

### Error messages appear

- Check your internet connection (the extension needs to connect to the server)
- Try again after a few seconds
- If errors persist, try restarting VSCode

### Keyboard shortcut doesn't work

- Make sure you're pressing `Cmd+R` on Mac or `Ctrl+R` on Windows/Linux
- The shortcut only works when you're focused on a code editor
- You can also use Command Palette: "Code AI Interpreter: Interpret File by Blocks"

## Requirements

- VSCode version 1.106.1 or higher
- Internet connection (for API calls)

## Need Help?

If you're experiencing issues:

1. Make sure VSCode is up to date
2. Try reinstalling the extension
3. Check the VSCode Output panel for error messages (View → Output → Select "Code AI Interpreter")

## License

MIT License
