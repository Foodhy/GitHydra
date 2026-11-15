import { useEffect, useMemo } from "react";
import { fileName } from "./session";

export function MediaView({
  path,
  mime,
  media,
}: {
  path: string;
  mime: string;
  media: string;
}) {
  const source = `data:${mime};base64,${media}`;
  if (mime === "application/pdf") {
    return (
      <embed
        title={fileName(path)}
        type="application/pdf"
        src={source}
        className="h-full w-full bg-surface"
      />
    );
  }
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-surface p-6">
      <img
        alt={fileName(path)}
        src={source}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}

export function SvgView({ text }: { text: string }) {
  const source = useMemo(() => {
    const blob = new Blob([text], { type: "image/svg+xml" });
    return URL.createObjectURL(blob);
  }, [text]);
  useEffect(() => {
    return () => URL.revokeObjectURL(source);
  }, [source]);
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-surface p-6">
      <img
        alt=""
        src={source}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}
