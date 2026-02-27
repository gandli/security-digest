import { Category, SecurityItem } from "./types";

export function categorizeItem(title: string, content: string): Category {
  const text = `${title} ${content}`.toLowerCase();
  
  // CVE/Vulnerability patterns
  if (/cve-\d{4}-\d+/i.test(text) || 
      /vulnerability|exploit|patch|zero-day|zeroday/i.test(text)) {
    return "vulnerability";
  }
  
  // Threat Intel patterns
  if (/apt\s*\d+|ransomware|malware|phishing|apt group|threat actor|ioc/i.test(text)) {
    return "threat";
  }
  
  // Security Research patterns
  if (/research|analysis|deep dive|technical|whitepaper|paper\b/i.test(text)) {
    return "research";
  }
  
  // Tool patterns
  if (/tool|scanner|framework|github|release|open.?source/i.test(text)) {
    return "tool";
  }
  
  // Incident patterns
  if (/breach|leak|hack|attack|incident|compromised/i.test(text)) {
    return "incident";
  }
  
  // News patterns
  if (/regulation|compliance|policy|acquisition|funding|industry/i.test(text)) {
    return "news";
  }
  
  return "misc";
}

export function mergeCVEItems(items: SecurityItem[]): SecurityItem[] {
  const cveMap = new Map<string, SecurityItem>();
  const nonCveItems: SecurityItem[] = [];
  
  for (const item of items) {
    const cveMatch = item.title.match(/CVE-\d{4}-\d+/i);
    
    if (cveMatch) {
      const cveId = cveMatch[0].toUpperCase();
      
      if (cveMap.has(cveId)) {
        // Merge sources
        const existing = cveMap.get(cveId)!;
        existing.sources = existing.sources || [existing.source!];
        if (!existing.sources.includes(item.source!)) {
          existing.sources.push(item.source!);
        }
        // Keep the most detailed content
        if (item.content.length > existing.content.length) {
          existing.content = item.content;
          existing.link = item.link;
        }
      } else {
        item.cveId = cveId;
        cveMap.set(cveId, item);
      }
    } else {
      nonCveItems.push(item);
    }
  }
  
  // Update title for merged items
  for (const item of cveMap.values()) {
    if (item.sources && item.sources.length > 1) {
      item.title = `[${item.sources.length} sources] ${item.title}`;
    }
  }
  
  return [...Array.from(cveMap.values()), ...nonCveItems];
}

export function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

export function extractCVEs(text: string): string[] {
  const matches = text.match(/CVE-\d{4}-\d+/gi);
  return matches ? [...new Set(matches.map(m => m.toUpperCase()))] : [];
}