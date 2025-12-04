# Code AI Interpreter

A VSCode extension that automatically interprets code line by line into human-readable language.

## Features

- **Automatic Inline Interpretation**: When enabled, interpretation text is automatically displayed at the end of each code line
- **Multiple Language Support**: Choose from 15+ languages for code interpretation (English, Korean, Japanese, Chinese, Spanish, French, German, and more)
- **Real-time Updates**: When you modify code, the interpretation for changed lines is automatically updated
- **Easy Toggle**: Turn the interpretation feature on and off easily with a single status bar button

## Installation

1. Open VSCode
2. Click on the Extensions tab (the Extensions icon in the left sidebar)
3. Search for "Code AI Interpreter"
4. Click the "Install" button

## Setup

No additional setup required! The extension is ready to use out of the box.

## Usage

### Enable Interpretation

1. Click the "Interpretation Off" button in the bottom right of the VSCode status bar
2. When the button changes to "Interpretation On", the interpretation feature is activated
3. Interpretation text will automatically appear at the end of each code line

### Disable Interpretation

- Click the "Interpretation On" button in the status bar again to turn off interpretation

### Change Interpretation Language

1. Open VSCode Settings (`Cmd+,` on Mac or `Ctrl+,` on Windows/Linux)
2. Search for "Code AI Interpreter"
3. Select your preferred language from the "Interpretation Language" dropdown
4. The interpretation will automatically update to the selected language

Supported languages: English, Korean, Japanese, Chinese (Simplified), Chinese (Traditional), Spanish, French, German, Portuguese, Russian, Italian, Arabic, Hindi, Vietnamese, Thai

### Example

When interpretation is enabled, it will display like this:

```javascript
const x = 10;  💡 Initializes variable x with the value 10
console.log(x);  💡 Outputs the value of variable x to the console
```

## Notes

- When interpretation is enabled, API calls may occur each time you modify code
- In files with large amounts of code, it may take time for interpretations to appear
- It is recommended to enable interpretation only when needed

## Troubleshooting

### Interpretations are not showing
- Check if the status bar shows "Interpretation On"
- Try saving the code or reopening the file
- Try restarting VSCode

### Interpretations are too slow
- Interpretations are processed asynchronously, so it may take time to display
- For large files, only some lines may be interpreted (up to 100 lines)

### Having other issues?
- Try updating VSCode to the latest version
- Try reinstalling the extension

## Requirements

- VSCode 1.106.1 or higher

## License

MIT License
