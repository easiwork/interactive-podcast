import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, X, Search, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const API_BASE_URL = process.env.NODE_ENV === "development" ? "http://localhost:3000/api" : "api";

export interface Source {
  id: string;
  name: string;
  url: string;
  description: string;
  category?: string;
  isCustom?: boolean;
  isProcessing?: boolean;
  imageUrl?: string;
}

function getFaviconUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=32`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=example.com&sz=32`;
  }
}

// Group sources by category
const categories = {
  'Custom Feeds': [], // This will be populated with custom feeds
  'News & Politics': ['daily', 'upfirst', 'npr'],
  'Technology': ['lexfridman', 'darknet', 'hackernews'],
  'Business': ['planetmoney', 'freakonomics', 'howimade', 'marketplace'],
  'Science': ['radiolab', 'sciencefriday', 'huberman', 'maintenance'],
  'Culture': ['thisamericanlife', 'hiddenbrain', 'invisibilia', 'accented'],
  'Design & Innovation': ['99percent']
};

export const defaultSources: Source[] = [
  {
    id: 'hackernews',
    name: 'Hacker News',
    url: 'https://news.ycombinator.com/rss',
    description: 'Latest stories from Hacker News',
    category: 'Technology'
  },
  {
    id: 'npr',
    name: 'NPR News',
    url: 'https://feeds.npr.org/1001/rss.xml',
    description: 'Latest news from NPR',
    category: 'News & Politics'
  },
  {
    id: 'daily',
    name: 'The Daily',
    url: 'https://feeds.simplecast.com/54nAGcIl',
    description: 'The biggest stories of our time, told by the best journalists in the world',
    category: 'News & Politics'
  },
  {
    id: 'ologies',
    name: 'Ologies with Alie Ward',
    url: 'https://feeds.simplecast.com/FO6kxYGj',
    description: 'A science podcast for people who would never listen to a science podcast. Hosted by Alie Ward, each episode dives into a different “-ology” with expert guests.',
    category: 'Even more Science & Curiosity'
  },
  {
    id: 'gastropod',
    name: 'Gastropod',
    url: 'https://feeds.megaphone.fm/VMP6255701211',
    description: 'Gastropod looks at food through the lens of science and history. Hosted by Cynthia Graber and Nicola Twilley, it’s like Radiolab for your dinner plate.',
    category: 'Even more Science & Curiosity'
  },
  {
    id: 'upfirst',
    name: 'Up First',
    url: 'https://feeds.npr.org/510318/podcast.xml',
    description: 'NPR\'s morning news podcast',
    category: 'News & Politics'
  },
  {
    id: 'lexfridman',
    name: 'Lex Fridman Podcast',
    url: 'https://lexfridman.com/feed/podcast/',
    description: 'Conversations about science, technology, history, philosophy and the nature of intelligence',
    category: 'Technology'
  },
  {
    id: 'darknet',
    name: 'Darknet Diaries',
    url: 'https://feeds.megaphone.fm/darknetdiaries',
    description: 'True stories from the dark side of the Internet',
    category: 'Technology'
  },
  {
    id: 'planetmoney',
    name: 'Planet Money',
    url: 'https://feeds.npr.org/510289/podcast.xml',
    description: 'The economy explained',
    category: 'Business'
  },
  {
    id: 'freakonomics',
    name: 'Freakonomics Radio',
    url: 'https://feeds.simplecast.com/54nAGcIl',
    description: 'Discover the hidden side of everything',
    category: 'Business'
  },
  {
    id: 'radiolab',
    name: 'Radiolab',
    url: 'https://feeds.simplecast.com/EmVW7VGp',
    description: 'Investigating a strange world',
    category: 'Science & Curiosity'
  },
  {
    id: 'sciencefriday',
    name: 'Science Friday',
    url: 'https://feeds.simplecast.com/54nAGcIl',
    description: 'Covering the outer reaches of space to the tiniest microbes in our bodies',
    category: 'Science & Curiosity'
  },
  {
    id: 'huberman',
    name: 'Huberman Lab',
    url: 'https://feeds.megaphone.fm/hubermanlab',
    description: 'Neuroscience and health',
    category: 'Science & Curiosity'
  },
  {
    id: 'maintenance',
    name: 'Maintenance Phase',
    url: 'https://feeds.buzzsprout.com/1411126.rss',
    description: 'Debunking the junk science behind health fads',
    category: 'Science & Curiosity'
  },
  {
    id: 'hiddenbrain',
    name: 'Hidden Brain',
    url: 'https://feeds.simplecast.com/kwWc0lhf',
    description: 'Science and storytelling',
    category: 'Culture'
  },
  {
    id: 'invisibilia',
    name: 'Invisibilia',
    url: 'https://feeds.npr.org/510307/podcast.xml',
    description: 'Unseeable forces that control human behavior',
    category: 'Culture'
  },
  {
    id: 'accented',
    name: 'Accented',
    url: 'https://feeds.buzzsprout.com/586573.rss',
    description: 'Stories about language and identity',
    category: 'Culture'
  },
  {
    id: '99percent',
    name: '99% Invisible',
    url: 'https://feeds.simplecast.com/BqbsxVfO',
    description: 'Design is everywhere in our lives',
    category: 'Design & Innovation'
  },
  {
    id: 'howimade',
    name: 'How I Built This',
    url: 'https://rss.art19.com/how-i-built-this',
    description: 'Stories behind some of the world\'s best known companies',
    category: 'Business'
  },
  {
    id: 'marketplace',
    name: 'Marketplace',
    url: 'https://feeds.publicradio.org/public_feeds/marketplace',
    description: 'Business news and economic analysis',
    category: 'Business'
  }
];

interface SourceSelectorProps {
  sources: Source[];
  selectedSource: Source;
  onSourceChange: (source: Source) => void;
  onAddCustomSource: (url: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function SourceSelector({
  sources,
  selectedSource,
  onSourceChange,
  onAddCustomSource,
  onKeyDown,
}: SourceSelectorProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>(Object.keys(categories));
  const [processingFeeds, setProcessingFeeds] = useState<Set<string>>(new Set());

  const handleCustomUrlSubmit = async () => {
    if (customUrl.trim()) {
      const newFeedId = `custom-${Date.now()}`;
      setProcessingFeeds(prev => new Set([...prev, newFeedId]));
      
      try {
        await onAddCustomSource(customUrl.trim());
      } finally {
        setProcessingFeeds(prev => {
          const next = new Set(prev);
          next.delete(newFeedId);
          return next;
        });
      }
      
      setCustomUrl('');
      setShowCustomInput(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLDivElement>) => {
    if (e.key === 'Enter' && showCustomInput) {
      handleCustomUrlSubmit();
    } else if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const filteredSources = sources.filter(source => {
    const matchesSearch = searchQuery === '' ||
      source.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      source.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const groupedSources = filteredSources.reduce((acc, source) => {
    const category = source.isCustom ? 'Custom Feeds' : (source.category || 'Uncategorized');
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(source);
    return acc;
  }, {} as Record<string, Source[]>);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Select Source</Label>
            {!showCustomInput && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCustomInput(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Feed
              </Button>
            )}
          </div>

          {showCustomInput ? (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Enter RSS feed URL"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowCustomInput(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Button
                className="w-full"
                onClick={handleCustomUrlSubmit}
                disabled={!customUrl.trim()}
              >
                Add Feed
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search feeds..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                {Object.entries(groupedSources).map(([category, sources]) => (
                  <Collapsible
                    key={category}
                    open={expandedCategories.includes(category)}
                    onOpenChange={() => toggleCategory(category)}
                  >
                    <CollapsibleTrigger className="flex items-center w-full p-2 hover:bg-accent rounded-md">
                      {expandedCategories.includes(category) ? (
                        <ChevronDown className="h-4 w-4 mr-2" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mr-2" />
                      )}
                      <span className="font-medium">{category}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <RadioGroup
                        value={selectedSource.id}
                        onValueChange={(value: string) => {
                          const source = sources.find((s) => s.id === value);
                          if (source) {
                            onSourceChange(source);
                          }
                        }}
                        onKeyDown={handleKeyDown}
                        className="space-y-1"
                      >
                        {sources.map((source) => {
                          const isProcessing = processingFeeds.has(source.id);
                          return (
                            <div
                              key={source.id}
                              className={`flex items-center space-x-3 p-2 rounded-md cursor-pointer hover:bg-accent ${
                                selectedSource.id === source.id ? 'bg-accent' : ''
                              } ${isProcessing ? 'opacity-50' : ''}`}
                              onClick={() => !isProcessing && onSourceChange(source)}
                            >
                              <RadioGroupItem 
                                value={source.id} 
                                id={source.id} 
                                disabled={isProcessing}
                              />
                              <Label
                                htmlFor={source.id}
                                className="flex items-center space-x-2 cursor-pointer flex-1"
                              >
                                <img
                                  src={source.imageUrl ? `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(source.imageUrl)}` : getFaviconUrl(source.url)}
                                  alt=""
                                  className={`${source.imageUrl ? 'w-8 h-8' : 'w-4 h-4'} rounded-sm object-cover`}
                                  onError={(e) => {
                                    const img = e.target as HTMLImageElement;
                                    if (source.imageUrl) {
                                      img.src = getFaviconUrl(source.url);
                                      img.className = 'w-4 h-4';
                                    } else {
                                      img.style.display = 'none';
                                    }
                                  }}
                                />
                                <div className="flex-1">
                                  <div className="font-medium flex items-center">
                                    {source.name}
                                    {isProcessing && (
                                      <svg className="animate-spin ml-2 h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {source.description}
                                  </div>
                                </div>
                              </Label>
                            </div>
                          );
                        })}
                      </RadioGroup>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 