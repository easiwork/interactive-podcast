export const fetchHNTopStories = async (): Promise<number[]> => {
  const response = await fetch(
    "https://hacker-news.firebaseio.com/v0/topstories.json"
  );
  return response.json();
};

export interface Story {
  id: number;
  title: string;
  url: string;
}

export const fetchHNStory = async (id: number): Promise<Story> => {
  const response = await fetch(
    `https://hacker-news.firebaseio.com/v0/item/${id}.json`
  );
  return response.json();
};
