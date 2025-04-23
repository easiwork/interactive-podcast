import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DebugResult {
  story?: any;
  notes?: string;
  script?: string;
  stories?: any[];
  error?: string;
}

const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:3000" : "api";

function NotesDisplay({ story, notes }: { story: any; notes: string }) {
  return (
    <div className="space-y-4">
      <div className="border-b pb-2">
        <h3 className="text-lg font-semibold">{story.title}</h3>
        <a
          href={story.url}
          className="text-sm text-blue-500 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {story.url}
        </a>
      </div>
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: notes }}
      />
    </div>
  );
}

function ScriptDisplay({
  stories,
  script,
}: {
  stories: any[];
  script: string;
}) {
  return (
    <div className="space-y-4">
      <div className="border-b pb-2">
        <h3 className="text-lg font-semibold mb-2">Stories Covered:</h3>
        <ul className="list-disc pl-4">
          {stories.map((story, index) => (
            <li key={index}>
              <a
                href={story.url}
                className="text-blue-500 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {story.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: script }}
      />
    </div>
  );
}

function PodcastDisplay({
  stories,
  script,
}: {
  stories: any[];
  script: string;
}) {
  return (
    <div className="space-y-4">
      <div className="border-b pb-2">
        <h3 className="text-lg font-semibold mb-2">Stories Covered:</h3>
        <ul className="list-disc pl-4">
          {stories.map((story, index) => (
            <li key={index}>
              <a
                href={story.url}
                className="text-blue-500 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {story.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: script }}
      />
    </div>
  );
}

export function DebugPage() {
  const [result, setResult] = useState<DebugResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null);

  const handleDebugCall = async (endpoint: string) => {
    setLoading(true);
    setError(null);
    setActiveEndpoint(endpoint);
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch data");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const renderResult = () => {
    if (!result) return null;

    switch (activeEndpoint) {
      case "/debug/generate-notes":
        return result.story && result.notes ? (
          <NotesDisplay story={result.story} notes={result.notes} />
        ) : null;
      case "/debug/generate-script":
        return result.stories && result.script ? (
          <ScriptDisplay stories={result.stories} script={result.script} />
        ) : null;
      case "/generate-podcast":
        return result.stories && result.script ? (
          <PodcastDisplay stories={result.stories} script={result.script} />
        ) : null;
      default:
        return (
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap font-mono text-sm">
            {JSON.stringify(result, null, 2)}
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex space-x-4">
        <Button
          onClick={() => handleDebugCall("/debug/generate-notes")}
          disabled={loading}
        >
          Generate Notes
        </Button>
        <Button
          onClick={() => handleDebugCall("/debug/generate-script")}
          disabled={loading}
        >
          Generate Script
        </Button>
        <Button
          onClick={() => handleDebugCall("/generate-podcast")}
          disabled={loading}
        >
          Generate Full Podcast
        </Button>
      </div>

      {loading && <div>Loading...</div>}
      {error && <div className="text-red-500">{error}</div>}

      {result && (
        <Card>
          <CardContent className="p-4">{renderResult()}</CardContent>
        </Card>
      )}
    </div>
  );
}
