# Code AI Interpreter

A VSCode extension that helps you understand code by translating it into human-readable explanations in your preferred language.

## What is this?

Code AI Interpreter automatically explains what your selected code does, line by line. It's like having a coding tutor right in your editor! Select code lines and get explanations as comments below each line.

## Features

- **Line-by-Line Interpretation**: Select code lines and press `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux) to get explanations
- **Language-Specific Comments**: Automatically uses the correct comment syntax for your file type (e.g., `#` for Python, `//` for JavaScript)
- **Indentation-Aware**: Comments are automatically aligned with your code's indentation level
- **Multiple Languages**: Get explanations in 15+ languages including English, Korean, Japanese, Chinese, and more

## Installation

1. Open VSCode
2. Go to Extensions (click the Extensions icon in the left sidebar, or press `Cmd+Shift+X` on Mac / `Ctrl+Shift+X` on Windows/Linux)
3. Search for "Code AI Interpreter"
4. Click the "Install" button
5. Wait for installation to complete

That's it! No additional setup needed.

## How to Use

### Interpret Selected Lines

Select the code lines you want to understand and get explanations as comments below each line.

1. Open any code file
2. Select the code lines you want to interpret
3. Press `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux)
4. Wait for the interpretation to complete (you'll see a progress notification)
5. Explanations will appear as comments below each selected line:

**Python example:**
```python
result = a + b
# 🧠 Calculates the sum of the two variables and stores it in result
```

**JavaScript example:**
```javascript
const result = a + b;
// 🧠 Calculates the sum of the two variables and stores it in the result constant
```

**With indentation:**
```python
def hello():
    print("Hello")
    # 🧠 The comment is automatically aligned to match the indentation
```

## Change Language

You can get explanations in different languages:

1. Open VSCode Settings:
   - Mac: `Cmd+,`
   - Windows/Linux: `Ctrl+,`
2. Search for "Code AI Interpreter"
3. Find "Interpretation Language" setting
4. Select your preferred language from the dropdown
5. Explanations will automatically use the selected language

**Supported Languages:**
English, Korean, Japanese, Chinese Simplified, Chinese Traditional, Spanish, French, German, Portuguese, Russian, Italian, Arabic, Hindi, Vietnamese, Thai

**Alternative method (Settings JSON):**
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Preferences: Open User Settings (JSON)"
3. Add the following:
```json
{
  "codeAIInterpreter.interpretationLanguage": "Korean"
}
```

## Comment Syntax

The comment syntax automatically adapts to your file type:

- **Python**: `# 🧠 explanation`
- **JavaScript/TypeScript/Java/C/C++/C#/Go/Rust**: `// 🧠 explanation`
- **HTML/XML**: `<!-- 🧠 explanation -->`
- **CSS/SCSS/Less/Sass**: `/* 🧠 explanation */`
- **SQL**: `-- 🧠 explanation`
- **Shell/Bash/YAML**: `# 🧠 explanation`

## Tips

- **Select specific lines**: You can select multiple lines or even non-consecutive lines (using multiple selections with `Cmd+Click` / `Ctrl+Click`)
- **Best for learning**: Select code sections you want to understand and get explanations as comments
- **Comments are editable**: The inserted comments are part of your file, so you can edit or delete them as needed
- **Indentation matching**: Comments automatically match your code's indentation level for better readability
- **Language preference**: Set your preferred language in settings to get explanations in your native language

## Troubleshooting

### Explanations are not showing

- Make sure you've selected code lines before pressing `Cmd+R` / `Ctrl+R`
- Make sure you're in a code file (not a text file)
- Try saving the file (`Cmd+S` / `Ctrl+S`)
- Try restarting VSCode
- Make sure you pressed `Cmd+R` / `Ctrl+R` or used the command palette

### Interpretations are slow

- This is normal when interpreting many lines - the extension processes code asynchronously
- Wait for the progress notification to complete
- For better performance, select fewer lines at a time

### Error messages appear

- Check your internet connection (the extension needs to connect to the server)
- Try again after a few seconds
- If errors persist, try restarting VSCode

### Keyboard shortcut doesn't work

- Make sure you're pressing `Cmd+R` on Mac or `Ctrl+R` on Windows/Linux
- The shortcut only works when you're focused on a code editor and have selected some lines
- You can also use Command Palette: "Code AI Interpreter: Interpret Selected Lines"

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
