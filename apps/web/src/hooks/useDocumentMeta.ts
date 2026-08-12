import { useEffect } from 'react';

interface DocumentMetaOptions {
  title: string;
  description?: string;
  robots?: string;
}

function setMetaTag(name: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

export function useDocumentMeta({
  title,
  description,
  robots,
}: DocumentMetaOptions) {
  useEffect(() => {
    document.title = title;

    if (description) {
      setMetaTag('description', description);
    }

    setMetaTag('robots', robots ?? 'index, follow');
  }, [title, description, robots]);
}
