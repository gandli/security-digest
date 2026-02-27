/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** OPML URL - URL to an OPML file with RSS feeds (e.g., CyberSecurityRSS) */
  "opmlUrl": string,
  /** Time Window (hours) - How many hours back to fetch news */
  "hoursBack": string,
  /** Max Items - Maximum number of items to display */
  "maxItems": string,
  /** Max Feeds - Maximum number of feeds to fetch */
  "maxFeeds": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `daily` command */
  export type Daily = ExtensionPreferences & {}
  /** Preferences accessible in the `sources` command */
  export type Sources = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `daily` command */
  export type Daily = {}
  /** Arguments passed to the `sources` command */
  export type Sources = {}
}

