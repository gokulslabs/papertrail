import { useEffect, useState } from "react";

/** Turn a Blob into an object URL for the lifetime of the component. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const url2 = URL.createObjectURL(blob);
    setUrl(url2);
    return () => URL.revokeObjectURL(url2);
  }, [blob]);
  return url;
}
