#!/usr/bin/env ts-node-script

import fs from "fs";
import path from "path";
import { startBundleScripts } from "./src/esbuild/start-bundle-script";
import { backupNamesInSettings, restoreNamesInSettingsFromBackup } from "./src/scaffold-theme/backup-names-in-settings";
import { generateAllMissingBlockPresetsFiles } from "./src/scaffold-theme/generate-blocks-presets-files";
import { backupTemplates } from "./src/scaffold-theme/backup-templates";
import toml from "toml";
import { ShopifyBlock, ShopifyCard, ShopifySection, ShopifySettings, ShopifyThemeBlock } from "./@types/shopify";
import { runEsbuild } from "./src/esbuild/esbuild";
import { buildTheme } from "./src/scaffold-theme/build-theme";
import { fixNamingConventions } from "./src/scaffold-theme/fix-naming-conventions";
import { generateBaseTypes } from "./src/scaffold-theme/generate-base-types";
import { generateCardsTypes } from "./src/scaffold-theme/generate-card-types";
import { generateClassicBlocksTypes } from "./src/scaffold-theme/generate-classic-blocks-types";
import { generateConfigFiles } from "./src/scaffold-theme/generate-config-files";
import { generateAllMissingPresetsFiles } from "./src/scaffold-theme/generate-presets-files";
import { generateSectionsTypes } from "./src/scaffold-theme/generate-section-types";
import { generateSettingTypes } from "./src/scaffold-theme/generate-setting-types";
import { generateThemeBlocksTypes } from "./src/scaffold-theme/generate-theme-blocks-types";
import { getSchemaSources, getSources, getTargets } from "./src/scaffold-theme/parse-files";
import { syncPresets } from "./src/scaffold-theme/sync-presets";
import { validateTemplates } from "./src/scaffold-theme/validate-templates";
import { shopifyCliPull } from "./src/shopify-cli/pull";
import { runTailwindCSSWatcher } from "./src/tailwind/tailwind-watch";
import { capitalize } from "./src/utils/capitalize";
import { readFile, writeCompareFile, writeOnlyNew } from "./src/utils/fs";
import { JSONParse } from "./src/utils/json";
import { validateCliOptions } from "./src/validate-cli-options";
import { watchHeadless } from "./src/watch-headless/watch-headless";
import { watchTheme } from "./src/watch-theme/watch-theme";

const { Command } = require("commander");
const program = new Command();
require("dotenv").config();

process.env.BROWSERSLIST_IGNORE_OLD_DATA = "1";

export const root_dir = process.env.SHOPIFY_ACCELERATE_ROOT
  ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_ROOT)
  : process.cwd();

const tomlFile = fs.existsSync(path.join(process.cwd(), "shopify.theme.toml"))
  ? toml.parse(
      readFile(path.join(process.cwd(), "shopify.theme.toml"), {
        encoding: "utf-8",
      })
    )
  : null;

const shopify_toml = tomlFile
  ? JSONParse<{
      environments: {
        [T: string]: {
          theme: string | number;
          store: string;
          path: string;
          ignore?: string[];
          output?: "json";
          live?: boolean;
          "allow-live"?: boolean;
          all_presets?: boolean;
          sync_presets?: boolean;
          auto_backups?: boolean;
          mode: "development" | "production";
          ignore_blocks: string;
          ignore_snippets: string;
          ignore_layouts: string;
          ignore_sections: string;
          ignore_assets: string;
        };
      };
    }>(JSON.stringify(tomlFile))
  : { environments: {} };

export type GlobalsState = {
  options?: string;
  headless?: boolean;
  package_root: string;
  package_templates: string;
  package_types: string;
  project_root: ReturnType<typeof process.cwd>;
  all_presets: boolean;
  sync_presets: boolean;
  auto_backups: boolean;
  mode: "development" | "production";
  theme_id: number;
  theme_path: string;
  rebuild_eslint: boolean;
  store: string;
  environment: string;
  environments: (typeof shopify_toml)["environments"];
  ignore_blocks: string[];
  ignore_snippets: string[];
  ignore_layouts: string[];
  ignore_sections: string[];
  ignore_assets: string[];
  delete_external_layouts?: boolean;
  delete_external_sections?: boolean;
  delete_external_snippets?: boolean;
  delete_external_blocks?: boolean;
  delete_external_classic_blocks?: boolean;
  delete_external_assets?: boolean;
  disabled_locales?: boolean;
  sources: {
    snippets: Set<string>;
    layouts: string[];
    sectionsLiquid: string[];
    sectionsPresetFiles: string[];
    sectionsSchemaFiles: string[];
    sectionsJs: string[];
    assetsTs: string[];
    blocksLiquid: string[];
    blocksPresetFiles: string[];
    blocksSchemaFiles: string[];
    blocksJs: string[];
    blockSchemas: { [T: string]: ShopifyThemeBlock & { path: string; folder: string; type: string } };
    classic_blocksLiquid: string[];
    classic_blocksSchemaFiles: string[];
    classic_blocksJs: string[];
    classic_blockSchemas: { [T: string]: ShopifyBlock & { path: string; folder: string } };
    cardsLiquid: string[];
    cardsSchemaFiles: string[];
    cardsJs: string[];
    cardSchemas: { [T: string]: ShopifyCard & { path: string; folder: string } };
    assets: string[];
    giftCards: string[];
    configs: string[];
    sectionGroups: string[];
    templates: string[];
    customerTemplates: string[];
    liquidTemplates: string[];
    settingsFile: string;
    locale_duplicates: { [T: string]: string[] };
    settingsSchema: ShopifySettings;
    sectionSchemas: { [T: string]: ShopifySection & { path: string; folder: string; type: string } };
    allBlockSchemas: { [T: string]: ShopifyThemeBlock & { path: string; folder: string; type: string } };
  };
  targets: {
    assets: string[];
    dynamicJs: string[];
    blocks: string[];
    layout: string[];
    locales: string[];
    snippets: string[];
    sections: string[];
    settings: string;
    giftCards: string[];
    sectionGroups: string[];
    configs: string[];
    templates: string[];
    customerTemplates: string[];
  };
  folders: {
    types: string;
    utils: string;
    sections: string;
    layout: string;
    blocks: string;
    classic_blocks: string;
    cards: string;
    snippets: string;
    templates: string;
    assets: string;
    config: string;
  };
};

export const config: GlobalsState = {
  ignore_blocks: shopify_toml?.environments?.["development"]?.ignore_blocks?.split(",")?.map((str) => str.trim()) ?? [],
  ignore_snippets: shopify_toml?.environments?.["development"]?.ignore_snippets?.split(",")?.map((str) => str.trim()) ?? [],
  ignore_layouts: shopify_toml?.environments?.["development"]?.ignore_layouts?.split(",")?.map((str) => str.trim()) ?? [],
  ignore_sections: shopify_toml?.environments?.["development"]?.ignore_sections?.split(",")?.map((str) => str.trim()) ?? [],
  ignore_assets: shopify_toml?.environments?.["development"]?.ignore_assets?.split(",")?.map((str) => str.trim()) ?? [],
  delete_external_layouts: process.env.SHOPIFY_ACCELERATE_DELETE_EXTERNAL_LAYOUTS === "true",
  delete_external_sections: process.env.SHOPIFY_ACCELERATE_DELETE_EXTERNAL_SECTIONS === "true",
  delete_external_snippets: process.env.SHOPIFY_ACCELERATE_DELETE_EXTERNAL_SNIPPETS === "true",
  delete_external_blocks: process.env.SHOPIFY_ACCELERATE_DELETE_EXTERNAL_BLOCKS === "true",
  delete_external_classic_blocks: process.env.SHOPIFY_ACCELERATE_DELETE_EXTERNAL_CLASSIC_BLOCKS === "true",
  delete_external_assets: process.env.SHOPIFY_ACCELERATE_DELETE_EXTERNAL_ASSETS === "true",
  disabled_locales: true,
  package_root: path.resolve(__dirname),
  project_root: root_dir,
  package_templates: path.join(path.resolve(__dirname), "./src/templates"),
  package_types: path.join(path.resolve(__dirname), "./@types"),
  sources: {
    snippets: new Set(),
    layouts: [],
    sectionsLiquid: [],
    sectionsPresetFiles: [],
    sectionsSchemaFiles: [],
    sectionsJs: [],
    assetsTs: [],
    blocksLiquid: [],
    blocksPresetFiles: [],
    blocksSchemaFiles: [],
    blocksJs: [],
    blockSchemas: {},
    classic_blocksLiquid: [],
    classic_blocksSchemaFiles: [],
    classic_blocksJs: [],
    classic_blockSchemas: {},
    cardsLiquid: [],
    cardsSchemaFiles: [],
    cardsJs: [],
    cardSchemas: {},
    assets: [],
    giftCards: [],
    configs: [],
    sectionGroups: [],
    templates: [],
    customerTemplates: [],
    liquidTemplates: [],
    settingsFile: undefined,
    locale_duplicates: {},
    settingsSchema: null,
    sectionSchemas: {},
    allBlockSchemas: {},
  },
  targets: {
    assets: [],
    dynamicJs: [],
    blocks: [],
    layout: [],
    locales: [],
    snippets: [],
    sections: [],
    settings: null,
    giftCards: [],
    sectionGroups: [],
    configs: [],
    templates: [],
    customerTemplates: [],
  },
  folders: {
    types: process.env.SHOPIFY_ACCELERATE_TYPES
      ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_TYPES)
      : path.join(root_dir, "@types"),
    utils: process.env.SHOPIFY_ACCELERATE_UTILS
      ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_UTILS)
      : path.join(root_dir, "@utils"),
    sections: process.env.SHOPIFY_ACCELERATE_SECTIONS
      ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_SECTIONS)
      : path.join(root_dir, "sections"),
    layout: process.env.SHOPIFY_ACCELERATE_LAYOUT
      ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_LAYOUT)
      : path.join(root_dir, "layout"),
    blocks: process.env.SHOPIFY_ACCELERATE_BLOCKS
      ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_BLOCKS)
      : path.join(root_dir, "blocks"),
    classic_blocks: process.env.SHOPIFY_ACCELERATE_CLASSIC_BLOCKS
      ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_CLASSIC_BLOCKS)
      : path.join(root_dir, "classic-blocks"),
    cards: process.env.SHOPIFY_ACCELERATE_CARDS
      ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_CARDS)
      : path.join(root_dir, "cards"),
    snippets: process.env.SHOPIFY_ACCELERATE_SNIPPETS
      ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_SNIPPETS)
      : path.join(root_dir, "snippets"),
    templates: process.env.SHOPIFY_ACCELERATE_TEMPLATES
      ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_TEMPLATES)
      : path.join(root_dir, "templates"),
    assets: process.env.SHOPIFY_ACCELERATE_ASSETS
      ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_ASSETS)
      : path.join(root_dir, "assets"),
    config: process.env.SHOPIFY_ACCELERATE_CONFIG
      ? path.join(process.cwd(), process.env.SHOPIFY_ACCELERATE_CONFIG)
      : path.join(root_dir, "config"),
  },
  environments: Object.entries(shopify_toml?.environments ?? {})?.reduce((acc, [key, val]) => {
    acc[key] = {
      ...val,
      store: val?.store?.replace(/\.myshopify\.com/gi, ""),
    };
    return acc;
  }, {}),
  environment: shopify_toml?.environments?.["development"]
    ? "development"
    : Object.keys(shopify_toml?.environments)?.[0] ?? "development",
  theme_id: +shopify_toml?.environments?.["development"]?.theme,
  theme_path: shopify_toml?.environments?.["development"]?.path ?? "./theme/development",
  rebuild_eslint: false,
  store: shopify_toml?.environments?.["development"]?.store,
  all_presets: shopify_toml?.environments?.["development"]?.all_presets,
  sync_presets: shopify_toml?.environments?.["development"]?.sync_presets,
  auto_backups: shopify_toml?.environments?.["development"]?.auto_backups,
  mode: shopify_toml?.environments?.["development"]?.mode ?? "production",
};

program
  .name("shopify-accelerate")
  .description("CLI for Accelerated Shopify Theme development")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  .version(require(path.join("./", "package.json")).version);

program
  .command("init")
  .description("Initialize a local development environment from an existing Shopify theme")
  // .argument("<string>", "string to split")
  .option("-e, --environment <environment_name>", "Development environment name", "development")
  .option(
    "-s, --store <store_id>",
    "Shopify store id. I.e `https://admin.shopify.com/store/<store_id>` or `https://<store_id>.myshopify.com`"
  )
  .option(
    "-t, --theme <theme_id>",
    "Shopify store id. I.e. `https://admin.shopify.com/store/<store_id>/themes/<theme_id>/editor`"
  )
  .action(async (options) => {
    config.options = options;
    await validateCliOptions(options);
    generateBaseTypes();
    await getSources();
    getTargets();

    await buildTheme();
    generateConfigFiles();
    await shopifyCliPull();
    backupTemplates();
  });

program
  .command("transform")
  .description("Transform a local development environment from an existing Shopify theme")
  // .argument("<string>", "string to split")
  .option("-e, --environment <environment_name>", "Development environment name", "development")
  .option(
    "-s, --store <store_id>",
    "Shopify store id. I.e `https://admin.shopify.com/store/<store_id>` or `https://<store_id>.myshopify.com`"
  )
  .option(
    "-t, --theme <theme_id>",
    "Shopify store id. I.e. `https://admin.shopify.com/store/<store_id>/themes/<theme_id>/editor`"
  )
  .action(async (options) => {
    config.options = options;
    await validateCliOptions(options);
    generateBaseTypes();
    await getSources();
    getTargets();

    await buildTheme();
    generateConfigFiles();
    await shopifyCliPull();
  });

program
  .command("dev")
  .description("Shopify Theme Development")
  // .argument("<string>", "string to split")
  .option("-e, --environment <environment_name>", "Development environment name", "development")
  .option(
    "-s, --store <store_id>",
    "Shopify store id. I.e `https://admin.shopify.com/store/<store_id>` or `https://<store_id>.myshopify.com`"
  )
  .option(
    "-t, --theme <theme_id>",
    "Shopify store id. I.e. `https://admin.shopify.com/store/<store_id>/themes/<theme_id>/editor`"
  )
  .option("-rjs, --rebuild-js", "Rebuild all JS files via ESBuild using Prettier. This is a long running task.")
  .action(async (options) => {
    config.options = options;
    await validateCliOptions(options);

    generateBaseTypes();
    generateAllMissingPresetsFiles();
    generateAllMissingBlockPresetsFiles();
    await getSources();
    getTargets();

    await validateTemplates();
    await syncPresets();
    await fixNamingConventions(true);
    await buildTheme();
    generateConfigFiles();
    runEsbuild();
    runTailwindCSSWatcher();
    watchTheme();
    startBundleScripts({ watch: true, debug: false });
    backupTemplates();
  });

program
  .command("backup-names")
  .description("Shopify Theme Development")
  // .argument("<string>", "string to split")
  .option("-e, --environment <environment_name>", "Development environment name", "development")
  .option(
    "-s, --store <store_id>",
    "Shopify store id. I.e `https://admin.shopify.com/store/<store_id>` or `https://<store_id>.myshopify.com`"
  )
  .option(
    "-t, --theme <theme_id>",
    "Shopify store id. I.e. `https://admin.shopify.com/store/<store_id>/themes/<theme_id>/editor`"
  )
  .action(async (options) => {
    config.options = options;
    await validateCliOptions(options);
    generateBaseTypes();
    generateAllMissingPresetsFiles();
    generateAllMissingBlockPresetsFiles();
    await getSources();
    getTargets();

    backupNamesInSettings();
  });

program
  .command("restore-names")
  .description("Shopify Theme Development")
  // .argument("<string>", "string to split")
  .option("-e, --environment <environment_name>", "Development environment name", "development")
  .option(
    "-s, --store <store_id>",
    "Shopify store id. I.e `https://admin.shopify.com/store/<store_id>` or `https://<store_id>.myshopify.com`"
  )
  .option(
    "-t, --theme <theme_id>",
    "Shopify store id. I.e. `https://admin.shopify.com/store/<store_id>/themes/<theme_id>/editor`"
  )
  .action(async (options) => {
    config.options = options;
    await validateCliOptions(options);
    generateBaseTypes();
    generateAllMissingPresetsFiles();
    generateAllMissingBlockPresetsFiles();
    await getSources();
    getTargets();

    restoreNamesInSettingsFromBackup();
  });

program
  .command("tailwind")
  .description("TailwindCSS Watcher")
  .option("-e, --environment <environment_name>", "Development environment name", "development")
  .option(
    "-s, --store <store_id>",
    "Shopify store id. I.e `https://admin.shopify.com/store/<store_id>` or `https://<store_id>.myshopify.com`"
  )
  .option(
    "-t, --theme <theme_id>",
    "Shopify store id. I.e. `https://admin.shopify.com/store/<store_id>/themes/<theme_id>/editor`"
  )
  .action(async (options) => {
    config.options = options;
    await validateCliOptions(options);
    runTailwindCSSWatcher();
  });

program
  .command("esbuild")
  .description("ESBuild Watcher")
  .option("-e, --environment <environment_name>", "Development environment name", "development")
  .option(
    "-s, --store <store_id>",
    "Shopify store id. I.e `https://admin.shopify.com/store/<store_id>` or `https://<store_id>.myshopify.com`"
  )
  .option(
    "-t, --theme <theme_id>",
    "Shopify store id. I.e. `https://admin.shopify.com/store/<store_id>/themes/<theme_id>/editor`"
  )
  .action(async (options) => {
    config.options = options;
    await validateCliOptions(options);
    runEsbuild();
    startBundleScripts({ watch: false, debug: false });
  });

program
  .command("headless")
  .description("Shopify Headless Development")
  .action(async (options) => {
    config.options = options;
    config.headless = true;
    generateBaseTypes();
    await getSources();
    await getSchemaSources();
    generateSectionsTypes();
    generateSettingTypes();
    generateThemeBlocksTypes();
    generateClassicBlocksTypes();
    generateCardsTypes();

    const imports = [`import type { FC } from "react";`];
    const renderBlocks = [];
    Object.entries(config.sources.sectionSchemas ?? {})?.forEach(([key, entry]) => {
      imports.push(`import { ${capitalize(key)} } from "sections/${entry.folder}/${entry.folder}";`);
      renderBlocks.push(`    case "${entry.folder}": {
      return <${capitalize(key)} {...section} />;
    }`);

      writeOnlyNew(
        entry.path?.replace("_schema.ts", `${entry.folder}.tsx`),
        `import type { ${capitalize(key)}Section } from "types/sections";

export const ${capitalize(key)} = ({ id, type, settings, blocks, disabled }: ${capitalize(key)}Section) => {
  if (disabled) return null
  
  return <>${capitalize(key)}</>;
};
`
      );
    });
    imports.push('import type { Sections } from "types/sections";');
    imports.push("");
    imports.push("type RenderSectionProps = { section: Sections; };");
    imports.push("");
    imports.push("export const RenderSection: FC<RenderSectionProps> = ({ section }) => {");
    imports.push("  switch (section.type) {");
    imports.push(...renderBlocks);
    imports.push("  }");
    imports.push("};");

    writeCompareFile(path.join(process.cwd(), "./app/[...slug]/render-section.tsx"), imports.join("\n"));

    watchHeadless();
  });

program.parse(process.argv);
