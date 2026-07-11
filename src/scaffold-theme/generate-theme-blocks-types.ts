import path from "path";
import { toPascalCase } from "../utils/to-pascal-case";
import { ShopifyBlock, ShopifySection, ShopifySettingsInput, ShopifyThemeBlock } from "../../@types/shopify";
import { config } from "../../shopify-accelerate";
import { capitalize } from "../utils/capitalize";
import { writeCompareFile } from "../utils/fs";

export const generateThemeBlocksTypes = () => {
  const { folders, sources } = config;
  const blocks = sources.blockSchemas;
  const sections = sources.sectionSchemas;

  const blockTypesPath = path.join(folders.types, "blocks.ts");

  const imports = getImports(blocks, sections);
  let sectionUnionType = "export type ThemeBlocks =";
  let globalThemeBlocksUnionType = "export type GlobalThemeBlocks =";
  let typeContent = "";

  const emittedBlockTypeNames = new Set<string>();
  const generateBlockTypes = (block, folder, key, rootSchema?: ShopifyThemeBlock | ShopifySection) => {
    if ("theme_block" in block && block.theme_block) {
      const newBlock = { ...block, folder: folder, filename: `${block.type}` };
      const blockTypeName = `${capitalize(key)}${toPascalCase(newBlock.type).replace(capitalize(key), "")}`;

      if (!emittedBlockTypeNames.has(blockTypeName)) {
        emittedBlockTypeNames.add(blockTypeName);

        typeContent += `${blockToTypes(newBlock, blockTypeName, true, rootSchema)}\n`;
        sectionUnionType += `\n  | ${blockTypeName}Block`;
      }

      block?.blocks?.forEach((childBlock) => generateBlockTypes(childBlock, folder, key, rootSchema));
    }
  };

  for (const key in blocks) {
    const schema = { ...blocks[key] };
    schema["filename"] = schema.folder;

    schema.blocks?.forEach((block) => generateBlockTypes(block, schema.folder?.replace(/^_*/gi, ""), key, schema));

    typeContent += `${blockToTypes(schema, key)}\n`;
    sectionUnionType += `\n  | ${capitalize(key)}Block`;
    if (!/^_/gi.test(schema.folder)) {
      globalThemeBlocksUnionType += `\n  | ${capitalize(key)}Block`;
    }
  }

  for (const key in sections) {
    const schema = sections[key];

    schema.blocks?.forEach((block) => generateBlockTypes(block, schema.folder?.replace(/^_*/gi, ""), key, schema));
  }

  if (!typeContent) return;

  const finalContent = `${imports + typeContent + sectionUnionType};\n\n${globalThemeBlocksUnionType};`;

  writeCompareFile(blockTypesPath, finalContent);
  writeCompareFile(
    path.join(config.theme_path, "assets", "_blocks.d.ts"),
    finalContent.replace(/(\s+from\s+")types[\\/]([^"\\/]*")/gi, "$1_$2").replace(/(\s+from\s+"[^"]*?)\.js"/gi, '$1.js"')
  );
};

export const getImports = (blocks: { [T: string]: ShopifyThemeBlock }, sections: { [T: string]: ShopifySection }) => {
  const localTypes = ["_Blog_liquid", "_Collection_liquid"];

  const analyseSetting = (setting) => {
    if (setting.type === "richtext") {
      if (localTypes.includes("_BlockTag")) return;
      localTypes.push("_BlockTag");
    }
    if (setting.type === "article") {
      if (localTypes.includes("_Article_liquid")) return;
      localTypes.push("_Article_liquid");
    }
    if (setting.type === "blog") {
      if (localTypes.includes("_Blog_liquid")) return;
      localTypes.push("_Blog_liquid");
    }
    if (setting.type === "collection" && !setting.id.includes("__handle_only")) {
      if (localTypes.includes("_Collection_liquid")) return;
      localTypes.push("_Collection_liquid");
    }
    if (setting.type === "collection_list" && !setting.id.includes("__handle_only")) {
      if (localTypes.includes("_Collection_liquid")) return;
      localTypes.push("_Collection_liquid");
    }
    if (setting.type === "color") {
      if (localTypes.includes("_Color_liquid")) return;
      localTypes.push("_Color_liquid");
    }
    if (setting.type === "image_picker") {
      if (localTypes.includes("_Image_liquid")) return;
      localTypes.push("_Image_liquid");
    }
    if (setting.type === "font_picker") {
      if (localTypes.includes("_Font_liquid")) return;
      localTypes.push("_Font_liquid");
    }
    if (setting.type === "font_picker") {
      if (localTypes.includes("_Font_options")) return;
      localTypes.push("_Font_options");
    }
    if (setting.type === "link_list") {
      if (localTypes.includes("_Linklist_liquid")) return;
      localTypes.push("_Linklist_liquid");
    }
    if (setting.type === "page") {
      if (localTypes.includes("_Page_liquid")) return;
      localTypes.push("_Page_liquid");
    }
    if (setting.type === "product" && !setting.id.includes("__handle_only")) {
      if (localTypes.includes("_Product_liquid")) return;
      localTypes.push("_Product_liquid");
    }
    if (setting.type === "product_list" && !setting.id.includes("__handle_only")) {
      if (localTypes.includes("_Product_liquid")) return;
      localTypes.push("_Product_liquid");
    }
    if (setting.type === "video") {
      if (localTypes.includes("_Video_liquid")) return;
      localTypes.push("_Video_liquid");
    }
  };

  for (const key in blocks) {
    const schema = blocks[key];

    schema.settings?.forEach(analyseSetting, localTypes);
    schema.blocks?.forEach((block) => {
      block?.settings?.forEach(analyseSetting, localTypes);
    });
  }

  for (const key in sections) {
    const schema = sections[key];

    schema.blocks?.forEach((block) => {
      try {
        if ("theme_block" in block && block.theme_block) {
          block?.settings?.forEach(analyseSetting, localTypes);
        }
      } catch (err) {
        console.log(err);
        console.log(schema.blocks);
        throw new Error("Short Circuit");
      }
    });
  }

  if (localTypes.length) {
    return `import type { ${localTypes.join(", ")} } from "./shopify.js";\n\n`;
  }
  return ``;
};

export const blockToTypes = (blockSchema, key, isSectionBlock = false, rootSchema?: ShopifyThemeBlock | ShopifySection) => {
  const filename = blockSchema.filename;

  const arr = [];
  const settings: ShopifySettingsInput[] = blockSchema.settings
    ?.filter((s) => s.type !== "header" && s.type !== "paragraph")
    .sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));
  const hasNonThemeBlocks = blockSchema.blocks?.filter(
    (b) => b.type !== "@app" && b.type !== "@theme" && b.type !== "@classic_theme"
  )?.length;
  const hasThemeBlocks = blockSchema.blocks?.some((block) => block.type === "@theme");

  arr.push(`export type ${capitalize(key)}Block = {`);
  if (hasNonThemeBlocks) {
    arr.push(`  blocks: ${capitalize(key)}Blocks[];`);
  }
  if (!hasNonThemeBlocks && hasThemeBlocks) {
    arr.push(`  blocks: GlobalThemeBlocks[];`);
  }
  if (!hasNonThemeBlocks && !hasThemeBlocks) {
    arr.push(`  blocks${config.headless ? "?" : ""}: never[];`);
  }
  arr.push(`  id${config.headless ? "?" : ""}: string;`);
  if (isSectionBlock) {
    arr.push(`  theme_block: true;`);
  }
  if (settings?.length) {
    arr.push(`  settings: {`);
    arr.push(
      settings
        .map(
          (setting) =>
            `    /** Input type: ${setting.type} */\n    ` +
            `${/[^\w_]/gi.test(setting.id) ? `"${setting.id}"` : `${setting.id}`}${getSettingsType(setting)};`
        )
        .sort((a, b) => {
          const aX = a.split("\n")[1];
          const bX = b.split("\n")[1];
          if (aX.includes("?") && !bX.includes("?")) {
            return 1;
          } else if (!aX.includes("?") && bX.includes("?")) {
            return -1;
          } else if (aX > bX) {
            return 1;
          } else if (aX < bX) {
            return -1;
          } else {
            return 0;
          }
        })
        .join("\n")
    );
    arr.push(`  };`);
  }
  arr.push(`  type: "${filename}";`);
  arr.push(`};`);

  const addBlockTypes = (schema, skipSingle = false, isLast = false) => {
    if (!skipSingle) {
      if (schema.blocks?.filter((block) => block.type !== "@app")?.length && schema.blocks?.length === 1) {
        const block = schema.blocks?.filter((block) => block.type !== "@app")[0];
        if (block.type === "@app" || block.type === "@classic_theme") {
        } else if (block.type === "@section_blocks") {
          addBlockTypes(rootSchema);
        } else if (block.type === "@theme") {
          arr.push("");
          arr.push(`export type ${capitalize(key)}Blocks = GlobalThemeBlocks;`);
        } else if (!block.name && block.type) {
          arr.push("");
          arr.push(`export type ${capitalize(key)}Blocks = Extract<ThemeBlocks, { type: "${block.type}" }>;`);
        } else if (block.theme_block) {
          arr.push("");
          arr.push(`export type ${capitalize(key)}Blocks = Extract<ThemeBlocks, { type: "${block.type}" }>;`);
        } else {
          arr.push("");
          arr.push(
            `export type ${capitalize(key)}Blocks = ${capitalize(key)}Blocks${toPascalCase(block.type.replace("@", ""))};`
          );
        }
      }
    }

    if (schema.blocks?.filter((block) => block.type !== "@app")?.length && (schema.blocks?.length > 1 || skipSingle)) {
      if (!skipSingle) {
        arr.push("");
        arr.push(`export type ${capitalize(key)}Blocks =`);
      }

      schema.blocks?.forEach((block, i) => {
        if (block.type === "@app" || block.type === "@classic_theme") {
        } else if (block.type === "@section_blocks") {
          if (schema.blocks?.length - 1 === i) {
            addBlockTypes(rootSchema, true, true);
          } else {
            addBlockTypes(rootSchema, true);
          }
        } else if (block.type === "@theme") {
          if (schema.blocks?.length - 1 === i && (!skipSingle || isLast)) {
            arr.push(`  | GlobalThemeBlocks;`);
          } else {
            arr.push(`  | GlobalThemeBlocks`);
          }
        } else if (!block.name && block.type) {
          if (schema.blocks?.length - 1 === i && (!skipSingle || isLast)) {
            arr.push(`  | Extract<ThemeBlocks, { type: "${block.type}" }>;`);
          } else {
            arr.push(`  | Extract<ThemeBlocks, { type: "${block.type}" }>`);
          }
        } else if (block.theme_block) {
          if (schema.blocks?.length - 1 === i && (!skipSingle || isLast)) {
            arr.push(`  | Extract<ThemeBlocks, { type: "${block.type}" }>;`);
          } else {
            arr.push(`  | Extract<ThemeBlocks, { type: "${block.type}" }>`);
          }
        } else {
          if (schema.blocks?.length - 1 === i && (!skipSingle || isLast)) {
            arr.push(`  | ${capitalize(key)}Blocks${toPascalCase(block.type.replace("@", ""))};`);
          } else {
            arr.push(`  | ${capitalize(key)}Blocks${toPascalCase(block.type.replace("@", ""))}`);
          }
        }
      });
    }
  };

  addBlockTypes(blockSchema);

  arr.push("");
  return arr.join("\n");
};

/* TODO: Update for Style settings in future*/
export const getSettingsType = (setting: ShopifySettingsInput) => {
  switch (setting.type) {
    case "article":
      return "?: _Article_liquid | string";
    case "checkbox":
      return ": boolean";
    case "number":
      return "?: number";
    case "radio":
      return `: ${setting.options.map(({ value }) => `"${value}"`).join(" | ")}`;
    case "range":
      return ": number";
    case "select":
      return `: ${setting.options.map(({ value }) => `"${value}"`).join(" | ")}`;
    case "text":
      return "?: string";
    case "textarea":
      return "?: string";
    case "blog":
      return "?: _Blog_liquid | string";
    case "collection": {
      if (setting.id.includes("__handle_only")) {
        return "?: string";
      }
      return "?: _Collection_liquid";
    }
    case "collection_list": {
      if (setting.id.includes("__handle_only")) {
        return "?: string[]";
      }
      return "?: _Collection_liquid[]";
    }
    case "color":
      return "?: _Color_liquid | string";
    case "color_background":
      return "?: string";
    case "font_picker":
      return ": _Font_liquid | _Font_options";
    case "html":
      return "?: string";
    case "image_picker":
      return "?: _Image_liquid | string";
    case "link_list":
      return "?: _Linklist_liquid";
    case "liquid":
      return "?: string";
    case "page":
      return "?: _Page_liquid | string";
    case "product": {
      if (setting.id.includes("__handle_only")) {
        return "?: string";
      }
      return "?: _Product_liquid";
    }
    case "product_list": {
      if (setting.id.includes("__handle_only")) {
        return "?: string[]";
      }
      return "?: _Product_liquid[]";
    }
    case "metaobject": {
      return "?: string";
    }
    case "metaobject_list": {
      return "?: string[]";
    }
    case "color_scheme_group":
      return `?: {\n    [T:string]: {${setting.definition
        .map((option) => {
          if ("id" in option) {
            return `\n      ${option.id}: string;`;
          }
          return "";
        })
        .join("")}\n    }\n  }`;
    case "richtext":
      return "?: `<${_BlockTag}${string}</${_BlockTag}>`";
    case "inline_richtext":
      return "?: string";
    case "url":
      return "?: string";
    case "video":
      return "?: _Video_liquid";
    case "video_url":
      return "?: `${string}youtube${string}` | `${string}vimeo${string}`";
    case "font":
      return "?: string";
    case "color_scheme":
      return "?: string";
    case "text_alignment":
      return `: "left" | "center" | "right"`;
  }
};
