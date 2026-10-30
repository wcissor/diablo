import { Config } from '@remotion/cli/config';

// Render with the headless shell that ships with this machine's Playwright, so
// nothing is downloaded at render time. Override with REMOTION_BROWSER.
Config.setBrowserExecutable(
  process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
);
Config.setVideoImageFormat('png');
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('swangle');
