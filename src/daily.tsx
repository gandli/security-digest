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
import Parser from "rss-parser";
import { SecurityItem, Category, Preferences, OPMLFeed } from "./types";
import { parseOPML, fetchOPMLFromURL, getBuiltinFeeds } from "./opml";
import { categorizeItem, mergeCVEItems } from "./utils";

const cache = new Cache();
const parser = new Parser({
  timeout: 10000,
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
      const CHUNK_SIZE = 2; // Reduce chunk size to save memory

      // Pre-calculate cutoff time
      const hoursAgo = preferences.hoursBack || 24;
      const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

      for (let i = 0; i < selectedFeeds.length; i += CHUNK_SIZE) {
        const chunk = selectedFeeds.slice(i, i + CHUNK_SIZE);
        const feedPromises = chunk.map(async (feed) => {
          try {
            const rssFeed = await parser.parseURL(feed.url);
            
            // Filter out items older than cutoff immediately
            const processedItems: SecurityItem[] = [];
            for (const item of rssFeed.items) {
              const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
              if (pubDate >= cutoff) {
                processedItems.push({
                  title: item.title || "Untitled",
                  link: item.link || "",
                  content: item.contentSnippet || item.content || "",
                  pubDate: pubDate,
                  source: feed.title,
                  sourceUrl: feed.url,
                  category: categorizeItem(
                    item.title || "",
                    item.contentSnippet || "",
                  ),
                });
              }
            }
            return processedItems;
          } catch (e) {
            console.error(`Failed to fetch feed ${feed.url}:`, e);
            return [];
          }
        });

        const results = await Promise.all(feedPromises);
        results.forEach((feedItems) => allItems.push(...feedItems));
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
