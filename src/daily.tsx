import {
  Action,
  ActionPanel,
  List,
  showToast,
  Toast,
  Icon,
  Color,
  getPreferenceValues,
  Cache,
} from "@raycast/api";
import { useEffect, useState, useCallback } from "react";
import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";
import { SecurityItem, Category, Preferences, OPMLFeed } from "./types";
import { parseOPML, fetchOPMLFromURL, getBuiltinFeeds } from "./opml";
import { categorizeItem, mergeCVEItems } from "./utils";

const cache = new Cache();
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  textNodeName: "_text",
});

const CATEGORY_ICONS: Record<Category, Icon> = {
  vulnerability: Icon.Bug,
  threat: Icon.LightBulb,
  research: Icon.Book,
  tool: Icon.Hammer,
  incident: Icon.Warning,
  news: Icon.Text,
  misc: Icon.Document,
};

const CATEGORY_COLORS: Record<Category, Color> = {
  vulnerability: Color.Red,
  threat: Color.Orange,
  research: Color.Blue,
  tool: Color.Purple,
  incident: Color.Yellow,
  news: Color.Green,
  misc: Color.SecondaryText,
};

const CATEGORY_LABELS: Record<Category, string> = {
  vulnerability: "🛡️ 漏洞",
  threat: "🔥 威胁情报",
  research: "🔬 安全研究",
  tool: "🛠️ 工具",
  incident: "💥 安全事件",
  news: "📰 行业动态",
  misc: "📋 其他",
};

export default function DailyDigest() {
  const [items, setItems] = useState<SecurityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | "all">(
    "all",
  );

  const preferences = getPreferenceValues<Preferences>();

  const fetchFeeds = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let feeds: OPMLFeed[] = [];

      // Try to fetch OPML from URL if configured
      if (preferences.opmlUrl) {
        try {
          const opmlContent = await fetchOPMLFromURL(preferences.opmlUrl);
          feeds = parseOPML(opmlContent);
        } catch (e) {
          console.error("Failed to fetch OPML from URL:", e);
        }
      }

      // Fallback to built-in feeds
      if (feeds.length === 0) {
        feeds = getBuiltinFeeds();
      }

      // Fetch RSS items from all feeds
      const allItems: SecurityItem[] = [];
      const selectedFeeds = feeds.slice(0, preferences.maxFeeds || 20);

      // Pre-calculate cutoff time
      const hoursAgo = preferences.hoursBack || 24;
      const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

      for (const feed of selectedFeeds) {
        try {
          console.log(`Fetching feed: ${feed.url}`);
          const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;

          const response = await fetch(feed.url, {
            headers: {
              "User-Agent": "security-digest/1.0",
            },
          });
          if (!response.ok) {
            console.log(`Feed skip (not ok: ${response.status}): ${feed.url}`);
            continue;
          }
          let xmlData: string | null = await response.text();
          console.log(`Data received (${xmlData.length} chars) from ${feed.url}`);

          const parsed = xmlParser.parse(xmlData);
          xmlData = null; // Clear large string immediately

          let parsedItems = [];
          if (parsed.rss && parsed.rss.channel && parsed.rss.channel.item) {
            parsedItems = Array.isArray(parsed.rss.channel.item)
              ? parsed.rss.channel.item
              : [parsed.rss.channel.item];
          } else if (parsed.feed && parsed.feed.entry) {
            parsedItems = Array.isArray(parsed.feed.entry)
              ? parsed.feed.entry
              : [parsed.feed.entry];
          }

          console.log(`Parsed ${parsedItems.length} items from ${feed.url}`);

          // Filter out items older than cutoff immediately
          for (const item of parsedItems) {
            const dateStr = item.pubDate || item.published || item.updated;
            const pubDate = dateStr ? new Date(dateStr) : new Date();
            if (pubDate >= cutoff) {
              const title = item.title?._text || item.title || "Untitled";
              const link =
                item.link?._text || item.link?.["@_href"] || item.link || "";
              const content =
                item.description?._text ||
                item.description ||
                item.content?._text ||
                item.summary?._text ||
                "";

              allItems.push({
                title: String(title),
                link: String(link),
                content:
                  String(content).substring(0, 500) +
                  (content.length > 500 ? "..." : ""),
                pubDate,
                source: feed.title,
                sourceUrl: feed.url,
                category: categorizeItem(String(title), String(content)),
              });
            }
          }

          const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
          console.log(
            `Mem: ${memBefore.toFixed(2)}MB -> ${memAfter.toFixed(2)}MB (+${(memAfter - memBefore).toFixed(2)}MB)`,
          );
        } catch (e) {
          console.error(`Failed to fetch feed ${feed.url}:`, e);
        }
      }

      // Merge CVE items
      const mergedItems = mergeCVEItems(allItems);

      // Sort by date
      mergedItems.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

      // Limit results
      const limitedItems = mergedItems.slice(0, preferences.maxItems || 50);

      setItems(limitedItems);
      cache.set("last_fetch", new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch feeds");
      showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to fetch feeds",
      });
    } finally {
      setIsLoading(false);
    }
  }, [preferences]);

  useEffect(() => {
    fetchFeeds();
  }, [fetchFeeds]);

  const filteredItems =
    selectedCategory === "all"
      ? items
      : items.filter((item) => item.category === selectedCategory);

  const categories: (Category | "all")[] = [
    "all",
    "vulnerability",
    "threat",
    "research",
    "tool",
    "incident",
    "news",
    "misc",
  ];

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search security news..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by category"
          storeValue={true}
          onChange={(value) => setSelectedCategory(value as Category | "all")}
        >
          {categories.map((cat) => (
            <List.Dropdown.Item
              key={cat}
              title={cat === "all" ? "📦 全部" : CATEGORY_LABELS[cat]}
              value={cat}
            />
          ))}
        </List.Dropdown>
      }
    >
      {error ? (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Failed to load feeds"
          description={error}
        />
      ) : filteredItems.length === 0 ? (
        <List.EmptyView
          icon={Icon.Text}
          title="No news found"
          description="Try adjusting your time window or check your feeds"
        />
      ) : (
        <List.Section
          title={`${filteredItems.length} items`}
          subtitle={`Last ${preferences.hoursBack || 24}h`}
        >
          {filteredItems.map((item, index) => (
            <List.Item
              key={`${item.link}-${index}`}
              title={item.title}
              subtitle={item.source}
              icon={{
                source: CATEGORY_ICONS[item.category],
                tintColor: CATEGORY_COLORS[item.category],
              }}
              accessories={[
                { text: getCategoryLabel(item.category) },
                { date: item.pubDate },
              ]}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser
                    url={item.link}
                    title="Open in Browser"
                  />
                  <Action.CopyToClipboard
                    content={`[${item.title}](${item.link})`}
                    title="Copy Markdown Link"
                  />
                  <Action.CopyToClipboard
                    content={item.link}
                    title="Copy URL"
                  />
                  <Action
                    icon={Icon.ArrowClockwise}
                    title="Refresh"
                    onAction={fetchFeeds}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function getCategoryLabel(category: Category): string {
  const labels: Record<Category, string> = {
    vulnerability: "CVE",
    threat: "威胁",
    research: "研究",
    tool: "工具",
    incident: "事件",
    news: "资讯",
    misc: "其他",
  };
  return labels[category];
}
