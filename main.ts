import {
  Editor,
  EditorPosition,
  HeadingCache,
  ListItemCache,
  MarkdownView,
  Plugin,
  SectionCache,
  TFile,
} from "obsidian";

function generateId(): string {
  return Math.random().toString(36).substr(2, 6);
}

const illegalHeadingCharsRegex = /[!"#$%&()*+,.:;<=>?@^`{|}~\/\[\]\\]/g;
function sanitizeHeading(heading: string) {
  return heading
    .replace(illegalHeadingCharsRegex, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldInsertAfter(block: ListItemCache | SectionCache) {
  if ((block as any).type) {
    return [
      "blockquote",
      "code",
      "table",
      "comment",
      "footnoteDefinition",
    ].includes((block as SectionCache).type);
  }
}

export default class MyPlugin extends Plugin {

  copiedFile: TFile | null = null;
  copiedSubPath: string | null = null;
  copiedisHeading: boolean = false;

  async onload() {
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {

        if (!((this.copiedFile === null)||(this.copiedSubPath===null))) {
          menu.addItem((item) => {
            item
              .setTitle(this.copiedisHeading?"Paste link to heading":"Paste link to block")
              .setIcon("links-going-out")
              .onClick(() => this.handlePaste(view.file, editor, false));
          });

          menu.addItem((item) => {
            item
              .setTitle(this.copiedisHeading?"Paste heading embed":"Paste block embed")
              .setIcon("links-going-out")
              .onClick(() => this.handlePaste(view.file, editor, true));
          });
        }

        const block = this.getBlock(editor, view.file);

        if (!block) return;

        const isHeading = !!(block as any).heading;

        const onCopy = (isEmbed: boolean) => {
          if (isHeading) {
            this.handleHeading(view.file, block as HeadingCache, isEmbed);
          } else {
            this.handleBlock(
              view.file,
              editor,
              block as SectionCache | ListItemCache,
              isEmbed
            );
          }
        };

        menu.addItem((item) => {
          item
            .setTitle(isHeading ? "Copy link to heading" : "Copy link to block")
            .setIcon("links-coming-in")
            .onClick(() => onCopy(false));
        });

        menu.addItem((item) => {
          item
            .setTitle(isHeading ? "Copy heading embed" : "Copy block embed")
            .setIcon("links-coming-in")
            .onClick(() => onCopy(true));
        });
      })
    );

    this.addCommand({
      id: "paste-link-to-block",
      name: "Paste link to last copied block or heading",
      editorCheckCallback: (isChecking, editor, view) => {
        return this.handlePasteCommand(isChecking, editor, view, false);
      },
    });

    this.addCommand({
      id: "paste-embed-to-block",
      name: "Copy embed to last copied block or heading",
      editorCheckCallback: (isChecking, editor, view) => {
        return this.handlePasteCommand(isChecking, editor, view, true);
      },
    });

    this.addCommand({
      id: "copy-link-to-block",
      name: "Copy link to current block or heading",
      editorCheckCallback: (isChecking, editor, view) => {
        return this.handleCommand(isChecking, editor, view, false);
      },
    });

    this.addCommand({
      id: "copy-embed-to-block",
      name: "Copy embed to current block or heading",
      editorCheckCallback: (isChecking, editor, view) => {
        return this.handleCommand(isChecking, editor, view, true);
      },
    });
    

  }

  handlePasteCommand(isChecking: boolean, editor: Editor, view: MarkdownView, isEmbed: boolean) {
    const shouldAbort = (this.copiedFile === null) || (this.copiedSubPath === null);
    if (isChecking) {
      return shouldAbort;
    }
    if (shouldAbort){
      return
    }
    this.handlePaste(view.file, editor, isEmbed);
  }

  handleCommand(
    isChecking: boolean,
    editor: Editor,
    view: MarkdownView,
    isEmbed: boolean
  ) {
    if (isChecking) {
      return !!this.getBlock(editor, view.file);
    }

    const block = this.getBlock(editor, view.file);

    if (!block) return;

    const isHeading = !!(block as any).heading;

    if (isHeading) {
      this.handleHeading(view.file, block as HeadingCache, isEmbed);
    } else {
      this.handleBlock(
        view.file,
        editor,
        block as SectionCache | ListItemCache,
        isEmbed
      );
    }
  }

  getBlock(editor: Editor, file: TFile) {
    const cursor = editor.getCursor("to");
    const fileCache = this.app.metadataCache.getFileCache(file);

    let block: ListItemCache | HeadingCache | SectionCache = (
      fileCache?.sections || []
    ).find((section) => {
      return (
        section.position.start.line <= cursor.line &&
        section.position.end.line >= cursor.line
      );
    });

    if (block?.type === "list") {
      block = (fileCache?.listItems || []).find((item) => {
        return (
          item.position.start.line <= cursor.line &&
          item.position.end.line >= cursor.line
        );
      });
    } else if (block?.type === "heading") {
      block = fileCache.headings.find((heading) => {
        return heading.position.start.line === block.position.start.line;
      });
    }

    return block;
  }

  handleHeading(file: TFile, block: HeadingCache, isEmbed: boolean) {

    this.copiedFile = file;
    this.copiedSubPath = "#" + sanitizeHeading(block.heading);

    navigator.clipboard.writeText(
      `${isEmbed ? "!" : ""}${this.app.fileManager.generateMarkdownLink(
        this.copiedFile,
        "",
        this.copiedSubPath
      )}`
    );
  }

  handleBlock(
    file: TFile,
    editor: Editor,
    block: ListItemCache | SectionCache,
    isEmbed: boolean
  ) {
    const blockId = block.id;
    this.copiedFile = file;

    // Copy existing block id
    if (blockId) {
      this.copiedSubPath = "#^" + blockId;

      return navigator.clipboard.writeText(
        `${isEmbed ? "!" : ""}${this.app.fileManager.generateMarkdownLink(
          this.copiedFile,
          "",
          this.copiedSubPath
        )}`
      );
    }

    // Add a block id
    const sectionEnd = block.position.end;
    const end: EditorPosition = {
      ch: sectionEnd.col,
      line: sectionEnd.line,
    };

    const id = generateId();
    this.copiedSubPath = "#^" + id;
    const spacer = shouldInsertAfter(block) ? "\n\n" : " ";

    editor.replaceRange(`${spacer}^${id}`, end);
    navigator.clipboard.writeText(
      `${isEmbed ? "!" : ""}${this.app.fileManager.generateMarkdownLink(
        this.copiedFile,
        "",
        this.copiedSubPath
      )}`
    );
  }

  handlePaste(file: TFile, editor: Editor, isEmbed: boolean) {
    if ((this.copiedFile === null) || (this.copiedSubPath === null)) {
      return;
    }

    return editor.replaceSelection(
      `${isEmbed ? "!" : ""}${this.app.fileManager.generateMarkdownLink(
        this.copiedFile,
        file.path,
        this.copiedSubPath
      )}`
    );
  }
}
