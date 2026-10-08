<p align="center"><img src="icons/icon128.png" width="96" alt="RepoNest"></p>

<h1 align="center">RepoNest</h1>
<p align="center"><b>Folders for GitHub organization repositories.</b><br>
A tiny Chrome extension that turns the flat <code>github.com/orgs/&lt;org&gt;/repositories</code> list into tidy, collapsible folders.</p>

---

GitHub lists every repository of an organization in one long, flat list. Once you have a few dozen repos – client sites, products, mobile apps, internal tools – it gets messy. RepoNest groups them into folders, right on GitHub's own Repositories page.

## Features

- **Automatic folders** – by topic out of the box, or by your own rules (name prefix such as `client-`, or topic). New repos land in the right folder by themselves; nothing to drag around.
- **List or grid** – collapsible folder list, or folder tiles you can open like a file browser.
- **Sort** by name or last update (newest first), ascending or descending. In "last updated" mode folders are ordered by their most recent activity too.
- **Reorder folders** with ▲ / ▼, **hide folders** you don't care about from the filter menu.
- **Search** across all folders.
- **On/off** from the toolbar button (badge shows ON / OFF) or the in-page *Flat list* button.
- Follows GitHub's **light and dark** themes. English and Turkish UI.

## Privacy

RepoNest runs only on `github.com`. It reads the repository list from GitHub's own Repositories page with your existing browser session and draws it on screen. **Nothing is sent anywhere** – no servers, no analytics, no tokens. See [PRIVACY.md](PRIVACY.md).

Permissions: `storage` (your folder rules and on/off state), `activeTab` + `scripting` (the toolbar button can start RepoNest on the current GitHub tab when Chrome's site access is set to "on click"), and host access to `https://github.com/*`.

## Install

**From source (developer mode)**

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. Open `https://github.com/orgs/<your-org>/repositories`.

## Folder rules

Right-click the toolbar icon → **Options**.

- Leave the table empty for **automatic** mode: each repo goes to its most common topic in the organization.
- Or add folders: a repository goes to the **first** folder whose name prefix matches; if no prefix matches, its topics are checked. Anything left over goes to **Other**.

Tip: give your repos a consistent prefix (`client-…`, `mobile-…`, `tool-…`) or topic, and RepoNest keeps the folders tidy for you.

## Build a store package

```bash
./scripts/package.sh
```

Creates `dist/reponest-<version>.zip` for the Chrome Web Store.

## How it works

The content script asks GitHub's Repositories page for its JSON payload (`Accept: application/json`, same origin, your session), loads every page, groups the repos and renders the folders above GitHub's list, which it hides while RepoNest is on. Plain JavaScript, no build step, no dependencies.

## License

[MIT](LICENSE) © Webgrup

<sub>Unofficial. Not affiliated with or endorsed by GitHub, Inc.</sub>
