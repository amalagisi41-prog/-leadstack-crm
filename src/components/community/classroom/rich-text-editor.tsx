"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { toast } from "sonner";
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  Video,
} from "lucide-react";
import { LessonVideo } from "./lesson-video-extension";
import { uploadCommunityImage } from "@/lib/community/upload-image";
import { parseVideoUrl } from "@/lib/community/video-embed";
import { lessonBodyToEditorHtml } from "@/lib/community/lesson-html-shared";
import { cn } from "@/lib/utils";

/**
 * Rich-text editor for course lesson bodies (Skool-style). Emits HTML via
 * `onChange`; the public player sanitizes it on render (see lesson-html.ts).
 * Images upload straight to Firebase Storage via the shared community helper;
 * the Video button embeds a YouTube/Vimeo player inline (the LessonVideo node).
 *
 * Mounted with a `key={lesson.id}` parent so it remounts per lesson — initial
 * content is read once, no value→editor syncing needed.
 */
export function RichTextEditor({
  value,
  onChange,
  saId,
  groupId,
}: {
  value: string;
  onChange: (html: string) => void;
  saId: string;
  groupId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      Image.configure({ HTMLAttributes: { class: "rounded-lg" } }),
      LessonVideo,
    ],
    content: lessonBodyToEditorHtml(value),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
          "min-h-[240px] px-3 py-2.5",
        ),
      },
    },
  });

  if (!editor) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-lg border">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleImageFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadCommunityImage(file, saId, groupId, "course");
      editor!.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function addLink() {
    const prev = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  }

  function addVideo() {
    const url = window.prompt("YouTube or Vimeo URL");
    if (!url) return;
    const parsed = parseVideoUrl(url);
    if (!parsed) {
      toast.error("Not a recognized YouTube or Vimeo link.");
      return;
    }
    editor!
      .chain()
      .focus()
      .setLessonVideo({ provider: parsed.provider, videoId: parsed.id })
      .run();
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
        <Tb editor={editor} on="heading" attrs={{ level: 1 }} cmd={(c) => c.toggleHeading({ level: 1 })} title="Heading 1"><Heading1 className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="heading" attrs={{ level: 2 }} cmd={(c) => c.toggleHeading({ level: 2 })} title="Heading 2"><Heading2 className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="heading" attrs={{ level: 3 }} cmd={(c) => c.toggleHeading({ level: 3 })} title="Heading 3"><Heading3 className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="heading" attrs={{ level: 4 }} cmd={(c) => c.toggleHeading({ level: 4 })} title="Heading 4"><Heading4 className="h-4 w-4" /></Tb>
        <Divider />
        <Tb editor={editor} on="bold" cmd={(c) => c.toggleBold()} title="Bold"><Bold className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="italic" cmd={(c) => c.toggleItalic()} title="Italic"><Italic className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="strike" cmd={(c) => c.toggleStrike()} title="Strikethrough"><Strikethrough className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="code" cmd={(c) => c.toggleCode()} title="Inline code"><Code className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="codeBlock" cmd={(c) => c.toggleCodeBlock()} title="Code block"><Code2 className="h-4 w-4" /></Tb>
        <Divider />
        <Tb editor={editor} on="bulletList" cmd={(c) => c.toggleBulletList()} title="Bullet list"><List className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="orderedList" cmd={(c) => c.toggleOrderedList()} title="Numbered list"><ListOrdered className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="blockquote" cmd={(c) => c.toggleBlockquote()} title="Quote"><Quote className="h-4 w-4" /></Tb>
        <Divider />
        <ToolbarBtn active={editor.isActive("link")} onClick={addLink} title="Link"><Link2 className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => fileRef.current?.click()} title="Image" disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </ToolbarBtn>
        <ToolbarBtn onClick={addVideo} title="Embed video"><Video className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider"><Minus className="h-4 w-4" /></ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo"><Undo2 className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo"><Redo2 className="h-4 w-4" /></ToolbarBtn>
      </div>

      <EditorContent editor={editor} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImageFile(f);
        }}
      />
    </div>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}

function ToolbarBtn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
        active && "bg-primary/15 text-primary",
      )}
    >
      {children}
    </button>
  );
}

/** Toolbar button bound to a TipTap mark/node toggle, with active state. */
function Tb({
  editor,
  on,
  attrs,
  cmd,
  title,
  children,
}: {
  editor: Editor;
  on: string;
  attrs?: Record<string, unknown>;
  cmd: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <ToolbarBtn
      active={attrs ? editor.isActive(on, attrs) : editor.isActive(on)}
      title={title}
      onClick={() => cmd(editor.chain().focus()).run()}
    >
      {children}
    </ToolbarBtn>
  );
}
