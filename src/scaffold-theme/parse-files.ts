import chalk from "chalk";
import importFresh from "import-fresh";
import path from "path";
import { toCamelCase } from "../utils/to-camel-case";
import { ShopifyBlock, ShopifySection, ShopifySectionGeneratedThemeBlock, ShopifySettings, ShopifyThemeBlock } from "../../@types/shopify";
import { config } from "../../shopify-accelerate";
import { getAllFiles } from "../utils/fs";
import { importAndTransformSchema } from "./import-and-transform-schema";

export const getSources = async () => {
  const { folders } = config;

  const sourceFiles = [
    ...getAllFiles(folders.sections),
    ...getAllFiles(folders.snippets),
    ...getAllFiles(folders.config),
    ...getAllFiles(folders.templates),
    ...getAllFiles(folders.assets),
    ...getAllFiles(folders.layout),
    ...getAllFiles(folders.utils),
    ...getAllFiles(folders.types),
    ...getAllFiles(folders.blocks),
    ...getAllFiles(folders.classic_blocks),
    ...getAllFiles(folders.cards),
  ];

  const typeScriptSchema = [];

  const snippets = new Set<string>();
  const layouts = [];
  const sectionsLiquid = [];
  const sectionsSchemaFiles = [];
  const sectionsPresetFiles = [];
  const sectionsJs = [];
  const assetsTs = [];
  const settingsFiles = [];
  const blocksPresetFiles = [];
  const blocksLiquid = [];
  const blocksSchemaFiles = [];
  const blocksJs = [];
  const classic_blocksLiquid = [];
  const classic_blocksSchemaFiles = [];
  const classic_blocksJs = [];
  const cardsLiquid = [];
  const cardsSchemaFiles = [];
  const cardsJs = [];
  const giftCards = [];
  const sectionGroups = [];
  const configs = [];
  const templates = [];
  const customerTemplates = [];
  const liquidTemplates = [];
  const assets = [];

  sourceFiles.forEach((filePath) => {
    if (isTypeScriptSchema(filePath)) {
      typeScriptSchema.push(filePath);
    }
    if (isSnippet(filePath)) {
      snippets.add(filePath);
    }
    if (isLayout(filePath)) {
      layouts.push(filePath);
    }
    if (isSectionLiquid(filePath)) {
      sectionsLiquid.push(filePath);
    }
    if (isSectionSchema(filePath)) {
      sectionsSchemaFiles.push(filePath);
    }
    if (isSectionPreset(filePath)) {
      sectionsPresetFiles.push(filePath);
    }
    if (isSectionTs(filePath)) {
      sectionsJs.push(filePath);
    }
    if (isAssetTs(filePath)) {
      assetsTs.push(filePath);
    }
    if (isBlockLiquid(filePath)) {
      blocksLiquid.push(filePath);
    }
    if (isBlockPreset(filePath)) {
      blocksPresetFiles.push(filePath);
    }
    if (isBlockSchema(filePath)) {
      blocksSchemaFiles.push(filePath);
    }
    if (isBlockTs(filePath)) {
      blocksJs.push(filePath);
    }
    if (isClassicBlockLiquid(filePath)) {
      classic_blocksLiquid.push(filePath);
      snippets.add(filePath);
    }
    if (isClassicBlockSchema(filePath)) {
      classic_blocksSchemaFiles.push(filePath);
    }
    if (isClassicBlockTs(filePath)) {
      classic_blocksJs.push(filePath);
    }
    if (isCardsLiquid(filePath)) {
      cardsLiquid.push(filePath);
      snippets.add(filePath);
    }
    if (isCardsSchema(filePath)) {
      cardsSchemaFiles.push(filePath);
    }
    if (isCardsTs(filePath)) {
      cardsJs.push(filePath);
    }
    if (isGiftCard(filePath)) {
      giftCards.push(filePath);
    }
    if (isSectionGroup(filePath)) {
      sectionGroups.push(filePath);
    }
    if (isConfig(filePath)) {
      configs.push(filePath);
    }
    if (isTemplate(filePath) && !isCustomerTemplate(filePath) && !isSectionGroup(filePath)) {
      templates.push(filePath);
    }
    if (isCustomerTemplate(filePath) && !isSectionGroup(filePath)) {
      customerTemplates.push(filePath);
    }
    if (isLiquidTemplate(filePath)) {
      liquidTemplates.push(filePath);
    }
    if (isAsset(filePath)) {
      assets.push(filePath);
    }
    if (isSettingsSchema(filePath)) {
      settingsFiles.push(filePath);
    }
  });

  config.sources.snippets = snippets;
  config.sources.layouts = layouts;
  config.sources.sectionsLiquid = sectionsLiquid;
  config.sources.sectionsSchemaFiles = sectionsSchemaFiles;
  config.sources.sectionsPresetFiles = sectionsPresetFiles;
  config.sources.sectionsJs = sectionsJs;
  config.sources.assetsTs = assetsTs;
  config.sources.blocksLiquid = blocksLiquid;
  config.sources.blocksPresetFiles = blocksPresetFiles;
  config.sources.blocksSchemaFiles = blocksSchemaFiles;
  config.sources.blocksJs = blocksJs;
  config.sources.classic_blocksLiquid = classic_blocksLiquid;
  config.sources.classic_blocksSchemaFiles = classic_blocksSchemaFiles;
  config.sources.classic_blocksJs = classic_blocksJs;
  config.sources.cardsLiquid = cardsLiquid;
  config.sources.cardsSchemaFiles = cardsSchemaFiles;
  config.sources.cardsJs = cardsJs;
  config.sources.assets = assets;
  config.sources.giftCards = giftCards;
  config.sources.configs = configs;
  config.sources.sectionGroups = sectionGroups;
  config.sources.templates = templates;
  config.sources.customerTemplates = customerTemplates;
  config.sources.liquidTemplates = liquidTemplates;
  config.sources.settingsFile = settingsFiles?.[0];
  config.sources.settingsSchema = settingsFiles?.[0]
    ? (importFresh(settingsFiles[0]) as { settingsSchema: ShopifySettings })?.settingsSchema
    : [];

  let acc: { [T: string]: ShopifySection & { path: string; folder: string; type: string } } = {};

  config.sources.blockSchemas = blocksSchemaFiles.reduce(
    (acc, file) => {
      try {
        const data = importFresh(file);

        return {
          ...acc,
          ...Object.entries(data).reduce((acc2, [key, schema]) => {
            const folder = file.split(/[\\/]/gi).at(-2);
            const schema_file_path = folder.replace(/^_*/gi, "");

            const mapBlocks = (blocks?: any[]) => {
              return blocks?.some((block) => block.theme_block)
                ? blocks.map((block) => {
                    const sectionBlockType = `_${schema_file_path}__${block.type}`;

                    const results = {
                      ...block,
                      type: block.name ? sectionBlockType : block.type,
                      theme_block: block.name ? true : undefined,
                      blocks: mapBlocks(block?.blocks),
                    };
                    if (block.name) {
                      config.sources.allBlockSchemas[toCamelCase(sectionBlockType)] = results;
                    }

                    return results;
                  })
                : blocks;
            };

            // @ts-ignore
            acc2[key] = {
              ...schema,
              folder,
              blocks: mapBlocks(schema?.blocks),
              path: file,
              type: folder?.replace(/^__/gi, "_"),
            };
            return acc2;
          }, {}),
        };
      } catch (err) {
        console.log(chalk.redBright(err.message));
        return acc;
      }
    },
    {} as { [T: string]: ShopifyBlock }
  );
  config.sources.allBlockSchemas = { ...config.sources.blockSchemas };

  for (let i = 0; i < sectionsSchemaFiles.length; i++) {
    const file = sectionsSchemaFiles[i];
    try {
      const data = await importAndTransformSchema(file);

      acc = {
        ...acc,
        ...Object.entries(data).reduce((acc2, [key, schema]) => {
          // @ts-ignore
          const folder = file.split(/[\\/]/gi).at(-2);
          const schema_file_path = folder.replace(/^_*/gi, "");

          const mapBlocks = (blocks?: any[]) => {
            return blocks?.some((block) => block.theme_block)
              ? blocks.map((block) => {
                  const sectionBlockType = `_${schema_file_path}__${block.type?.replace(`_${schema_file_path}__`, "")}`;
                  const blockPresets = schema.blockPresets?.[sectionBlockType];

                  const results = {
                    ...block,
                    type: block.name ? sectionBlockType : block.type,
                    theme_block: block.name ? true : undefined,
                    blocks: mapBlocks(block?.blocks),
                    presets:
                      block.presets && Array.isArray(block.presets)
                        ? block.presets
                        : blockPresets
                        ? blockPresets?.map(({ manual_preset, ...preset }) => preset)
                        : block.name
                        ? [{ name: block.name }]
                        : undefined,
                  };
                  if (block.name) {
                    config.sources.allBlockSchemas[toCamelCase(sectionBlockType)] = results;
                  }

                  return results;
                })
              : blocks;
          };

          acc2[key] = {
            ...schema,
            blocks: mapBlocks(schema?.blocks),
            folder,
            path: file,
            type: folder?.replace(/^_+/gi, ""),
          };

          return acc2;
        }, {}),
      };
    } catch (err) {
      console.log(chalk.redBright(err.message));
      return acc;
    }
  }

  config.sources.sectionSchemas = acc;

  config.sources.classic_blockSchemas = classic_blocksSchemaFiles.reduce(
    (acc, file) => {
      try {
        const data = importFresh(file);

        return {
          ...acc,
          ...Object.entries(data).reduce((acc2, [key, val]) => {
            // @ts-ignore
            acc2[key] = {
              ...val,
              folder: file.split(/[\\/]/gi).at(-2),
              path: file,
            };
            return acc2;
          }, {}),
        };
      } catch (err) {
        console.log(chalk.redBright(err.message));
        return acc;
      }
    },
    {} as { [T: string]: ShopifyBlock }
  );
  config.sources.cardSchemas = cardsSchemaFiles.reduce(
    (acc, file) => {
      try {
        const data = importFresh(file);

        return {
          ...acc,
          ...Object.entries(data).reduce((acc2, [key, val]) => {
            // @ts-ignore
            acc2[key] = { ...val, folder: file.split(/[\\/]/gi).at(-2), path: file };
            return acc2;
          }, {}),
        };
      } catch (err) {
        console.log(chalk.redBright(err.message));
        return acc;
      }
    },
    {} as { [T: string]: ShopifyBlock }
  );
};

export const getSchemaSources = async () => {
  const { folders } = config;

  const sourceFiles = [
    ...getAllFiles(folders.layout),
    ...getAllFiles(folders.snippets),
    ...getAllFiles(folders.blocks),
    ...getAllFiles(folders.classic_blocks),
    ...getAllFiles(folders.cards),
    ...getAllFiles(folders.sections),
    ...getAllFiles(folders.config),
  ];

  const typeScriptSchema = [];

  const snippets = new Set<string>();
  const layouts = [];
  const sectionsLiquid = [];
  const sectionsSchemaFiles = [];
  const sectionsPresetFiles = [];
  const settingsFiles = [];
  const blocksLiquid = [];
  const blocksPresetFiles = [];
  const blocksSchemaFiles = [];
  const classic_blocksLiquid = [];
  const classic_blocksSchemaFiles = [];
  const cardsLiquid = [];
  const cardsSchemaFiles = [];
  const giftCards = [];
  const assets = [];

  sourceFiles.forEach((filePath) => {
    if (isTypeScriptSchema(filePath)) {
      typeScriptSchema.push(filePath);
    }
    if (isSnippet(filePath)) {
      snippets.add(filePath);
    }

    if (isLayout(filePath)) {
      layouts.push(filePath);
    }
    if (isSectionLiquid(filePath)) {
      sectionsLiquid.push(filePath);
    }
    if (isSectionSchema(filePath)) {
      sectionsSchemaFiles.push(filePath);
    }
    if (isSectionPreset(filePath)) {
      sectionsPresetFiles.push(filePath);
    }
    if (isBlockLiquid(filePath)) {
      blocksLiquid.push(filePath);
    }
    if (isBlockPreset(filePath)) {
      blocksPresetFiles.push(filePath);
    }
    if (isBlockSchema(filePath)) {
      blocksSchemaFiles.push(filePath);
    }
    if (isClassicBlockLiquid(filePath)) {
      classic_blocksLiquid.push(filePath);
      snippets.add(filePath);
    }
    if (isClassicBlockSchema(filePath)) {
      classic_blocksSchemaFiles.push(filePath);
    }
    if (isCardsLiquid(filePath)) {
      cardsLiquid.push(filePath);
      snippets.add(filePath);
    }
    if (isCardsSchema(filePath)) {
      cardsSchemaFiles.push(filePath);
    }
    if (isAsset(filePath)) {
      assets.push(filePath);
    }
    if (isSettingsSchema(filePath)) {
      settingsFiles.push(filePath);
    }
  });

  Object.keys(require.cache)?.forEach((file) => {
    if (/[\\/]@utils[\\/]settings[\\/][^\\/]*\.ts$/gi.test(file)) {
      // importFresh(file);
      delete require.cache[file];
    }
    if (/[\\/]_presets\.ts$/gi.test(file)) {
      // importFresh(file);
      delete require.cache[file];
    }
  });

  config.sources.snippets = snippets;
  config.sources.layouts = layouts;
  config.sources.sectionsLiquid = sectionsLiquid;
  config.sources.sectionsSchemaFiles = sectionsSchemaFiles;
  config.sources.sectionsPresetFiles = sectionsPresetFiles;
  config.sources.blocksLiquid = blocksLiquid;
  config.sources.blocksPresetFiles = blocksPresetFiles;
  config.sources.classic_blocksLiquid = classic_blocksLiquid;
  config.sources.cardsLiquid = cardsLiquid;
  config.sources.giftCards = giftCards;
  config.sources.settingsFile = settingsFiles[0];
  config.sources.settingsSchema = settingsFiles?.[0]
    ? (importFresh(settingsFiles[0]) as { settingsSchema: ShopifySettings })?.settingsSchema
    : [];

  let acc: { [T: string]: ShopifySection & { path: string; folder: string; type: string } } = {};

  config.sources.blockSchemas = blocksSchemaFiles.reduce(
    (acc, file) => {
      try {
        const data = importFresh(file);

        return {
          ...acc,
          ...Object.entries(data).reduce((acc2, [key, schema]) => {
            const folder = file.split(/[\\/]/gi).at(-2);
            const schema_file_path = folder.replace(/^_*/gi, "");

            const mapBlocks = (blocks?: any[]) => {
              return blocks?.some((block) => block.theme_block)
                ? blocks.map((block) => {
                    const sectionBlockType = `_${schema_file_path}__${block.type}`;

                    const results = {
                      ...block,
                      type: block.name ? sectionBlockType : block.type,
                      theme_block: block.name ? true : undefined,
                      blocks: mapBlocks(block?.blocks),
                    };
                    if (block.name) {
                      config.sources.allBlockSchemas[toCamelCase(sectionBlockType)] = results;
                    }

                    return results;
                  })
                : blocks;
            };

            // @ts-ignore
            acc2[key] = {
              ...schema,
              folder,
              blocks: mapBlocks(schema?.blocks),
              path: file,
              type: folder?.replace(/^__/gi, "_"),
            };
            return acc2;
          }, {}),
        };
      } catch (err) {
        console.log(chalk.redBright(err.message));
        return acc;
      }
    },
    {} as { [T: string]: ShopifyBlock }
  );
  config.sources.allBlockSchemas = { ...config.sources.blockSchemas };

  for (let i = 0; i < sectionsSchemaFiles.length; i++) {
    const file = sectionsSchemaFiles[i];
    try {
      const data = await importAndTransformSchema(file);

      acc = {
        ...acc,
        ...Object.entries(data).reduce((acc2, [key, schema]) => {
          // @ts-ignore
          const folder = file.split(/[\\/]/gi).at(-2);
          const schema_file_path = folder.replace(/^_*/gi, "");

          const mapBlocks = (blocks?: any[]) => {
            return blocks?.some((block) => block.theme_block)
              ? blocks.map((block) => {
                  const sectionBlockType = `_${schema_file_path}__${block.type?.replace(`_${schema_file_path}__`, "")}`;
                  const blockPresets = schema.blockPresets?.[sectionBlockType];

                  const results = {
                    ...block,
                    type: block.name ? sectionBlockType : block.type,
                    theme_block: block.name ? true : undefined,
                    blocks: mapBlocks(block?.blocks),
                    presets:
                      block.presets && Array.isArray(block.presets)
                        ? block.presets
                        : blockPresets
                        ? blockPresets?.map(({ manual_preset, ...preset }) => preset)
                        : block.name
                        ? [{ name: block.name }]
                        : undefined,
                  };
                  if (block.name) {
                    config.sources.allBlockSchemas[toCamelCase(sectionBlockType)] = results;
                  }

                  return results;
                })
              : blocks;
          };

          acc2[key] = {
            ...schema,
            blocks: mapBlocks(schema?.blocks),
            folder,
            path: file,
            type: folder?.replace(/^_+/gi, ""),
          };

          return acc2;
        }, {}),
      };
    } catch (err) {
      console.log(chalk.redBright(err.message));
      return acc;
    }
  }

  config.sources.sectionSchemas = acc;

  config.sources.classic_blockSchemas = classic_blocksSchemaFiles.reduce(
    (acc, file) => {
      try {
        const data = importFresh(file);

        return {
          ...acc,
          ...Object.entries(data).reduce((acc2, [key, val]) => {
            // @ts-ignore
            acc2[key] = { ...val, folder: file.split(/[\\/]/gi).at(-2), path: file };
            return acc2;
          }, {}),
        };
      } catch (err) {
        console.log(chalk.redBright(err.message));
        return acc;
      }
    },
    {} as { [T: string]: ShopifyBlock }
  );
  config.sources.cardSchemas = cardsSchemaFiles.reduce(
    (acc, file) => {
      try {
        const data = importFresh(file);

        return {
          ...acc,
          ...Object.entries(data).reduce((acc2, [key, val]) => {
            // @ts-ignore
            acc2[key] = { ...val, folder: file.split(/[\\/]/gi).at(-2), path: file };
            return acc2;
          }, {}),
        };
      } catch (err) {
        console.log(chalk.redBright(err.message));
        return acc;
      }
    },
    {} as { [T: string]: ShopifyBlock }
  );
};

export const getTargets = () => {
  if (config.headless) {
    return;
  }
  const { theme_path } = config;

  const targetFiles = [
    ...getAllFiles(path.join(theme_path, "assets")),
    ...getAllFiles(path.join(theme_path, "sections")),
    ...getAllFiles(path.join(theme_path, "config")),
    ...getAllFiles(path.join(theme_path, "templates")),
  ];

  const assets = [];
  const sections = [];
  const settings = [];
  const dynamicJs = [];
  const giftCards = [];
  const sectionGroups = [];
  const configs = [];
  const templates = [];
  const customerTemplates = [];

  targetFiles.forEach((name) => {
    if (isTargetDynamicJs(name)) {
      dynamicJs.push(name);
    }
    if (!isTargetDynamicJs(name) && /[\\/]assets[\\/][^\\/]*$/gi.test(name)) {
      assets.push(name);
    }
    if (/[\\/]sections[\\/][^\\/]*\.liquid$/gi.test(name)) {
      sections.push(name);
    }
    if (/[\\/]templates[\\/]gift_card\.liquid$/gi.test(name)) {
      giftCards.push(name);
    }
    if (/[\\/]sections[\\/][^\\/]*\.json$/gi.test(name)) {
      sectionGroups.push(name);
    }
    if (/[\\/]config[\\/][^\\/]*\.json$/gi.test(name)) {
      configs.push(name);
    }
    if (/[\\/]templates[\\/][^\\/]*\.json$/gi.test(name)) {
      templates.push(name);
    }
    if (/[\\/]templates[\\/]customers[\\/][^\\/]*\.json$/gi.test(name)) {
      customerTemplates.push(name);
    }
    if (/[\\/]config[\\/]settings_schema\.ts$/gi.test(name)) {
      settings.push(name);
    }
  });

  config.targets.blocks = getAllFiles(path.join(theme_path, "blocks"));
  config.targets.layout = getAllFiles(path.join(theme_path, "layout"));
  config.targets.locales = getAllFiles(path.join(theme_path, "locales"));
  config.targets.snippets = getAllFiles(path.join(theme_path, "snippets"));
  config.targets.assets = assets;
  config.targets.dynamicJs = dynamicJs;
  config.targets.sections = sections;
  config.targets.settings = settings[0];
  config.targets.giftCards = giftCards;
  config.targets.sectionGroups = sectionGroups;
  config.targets.configs = configs;
  config.targets.templates = templates;
  config.targets.customerTemplates = customerTemplates;
};

export const isTypeScriptSchema = (name: string) =>
  (name.includes(config.folders.sections) && /[\\/][^\\/]*[\\/]_schema\.ts$/gi.test(name)) ||
  (name.includes(config.folders.blocks) && /[\\/][^\\/]*[\\/]_schema\.ts$/gi.test(name)) ||
  (name.includes(config.folders.classic_blocks) && /[\\/][^\\/]*[\\/]_schema\.ts$/gi.test(name)) ||
  (name.includes(config.folders.config) && /[\\/]settings_schema\.ts$/gi.test(name)) ||
  (name.includes(config.folders.utils) && /[\\/]settings[\\/][^\\/]*\.ts$/gi.test(name));

export const isSectionLiquid = (name: string) =>
  name.includes(config.folders.sections) && /[\\/][^\\/]*[\\/][^.]*\.liquid$/gi.test(name);

export const isSectionSchema = (name: string) =>
  name.includes(config.folders.sections) && /[\\/][^\\/]*[\\/]_schema\.ts$/gi.test(name);

export const isSectionPreset = (name: string) =>
  name.includes(config.folders.sections) && /[\\/][^\\/]*[\\/]_presets\.ts$/gi.test(name);

export const isBlockPreset = (name: string) =>
  name.includes(config.folders.blocks) && /[\\/][^\\/]*[\\/]_presets\.ts$/gi.test(name);

export const isSectionTs = (name: string) =>
  name.includes(config.folders.sections) &&
  !isSectionSchema(name) &&
  !isSectionPreset(name) &&
  /[\\/][^\\/]*[\\/][^\\/]*\.ts$/gi.test(name);

export const isAssetTs = (name: string) =>
  name.includes(config.folders.assets) && /\.ts$/gi.test(name) && !/\.d\.ts$/gi.test(name);

export const isSettingsSchema = (name: string) =>
  name.includes(config.folders.config) && /[\\/]settings_schema\.ts$/gi.test(name);

export const isAsset = (name: string) =>
  (name.includes(config.folders.assets) && /[\\/][^\\/]*$/gi.test(name)) ||
  (name.includes(config.folders.snippets) && /[\\/][^\\/]*.js$/gi.test(name)) ||
  (name.includes(config.folders.blocks) && /[\\/][^\\/]*.js$/gi.test(name)) ||
  (name.includes(config.folders.classic_blocks) && /[\\/][^\\/]*.js$/gi.test(name)) ||
  (name.includes(config.folders.sections) && /[\\/][^\\/]*.js$/gi.test(name));

export const isSnippet = (name: string) =>
  (name.includes(config.folders.sections) && /[\\/][^\\/]*[\\/][^.]*\.[^\\/]*\.liquid$/gi.test(name)) ||
  (name.includes(config.folders.blocks) && /[\\/][^\\/]*[\\/][^.]*\.[^\\/]*\.liquid$/gi.test(name)) ||
  (name.includes(config.folders.classic_blocks) && /[\\/][^\\/]*[\\/][^.]*\.[^\\/]*\.liquid$/gi.test(name)) ||
  (name.includes(config.folders.snippets) && /[\\/][^\\/]*\.liquid$/gi.test(name));

export const isBlockLiquid = (name: string) =>
  name.includes(config.folders.blocks) && /[\\/][^\\/]*[\\/][^.\\/]*\.liquid$/gi.test(name);

export const isBlockSchema = (name: string) =>
  name.includes(config.folders.blocks) && /[\\/][^\\/]*[\\/]_schema\.ts$/gi.test(name);

export const isBlockTs = (name: string) =>
  name.includes(config.folders.blocks) &&
  !isBlockSchema(name) &&
  !isBlockPreset(name) &&
  /[\\/][^\\/]*[\\/][^\\/]*?\.ts$/gi.test(name);

export const isClassicBlockLiquid = (name: string) =>
  name.includes(config.folders.classic_blocks) && /[\\/][^\\/]*[\\/][^.\\/]*\.liquid$/gi.test(name);

export const isClassicBlockSchema = (name: string) =>
  name.includes(config.folders.classic_blocks) && /[\\/][^\\/]*[\\/]_schema\.ts$/gi.test(name);

export const isClassicBlockTs = (name: string) =>
  name.includes(config.folders.classic_blocks) && !isClassicBlockSchema(name) && /[\\/][^\\/]*[\\/][^\\/]*?\.ts$/gi.test(name);

export const isCardsLiquid = (name: string) =>
  name.includes(config.folders.cards) && /[\\/][^\\/]*[\\/][^.\\/]*\.liquid$/gi.test(name);

export const isCardsSchema = (name: string) =>
  name.includes(config.folders.cards) && /[\\/][^\\/]*[\\/]_schema\.ts$/gi.test(name);

export const isCardsTs = (name: string) =>
  name.includes(config.folders.cards) && !isCardsSchema(name) && /[\\/][^\\/]*[\\/][^\\/]*?\.ts$/gi.test(name);

export const isLayout = (name: string) => {
  return name.includes(config.folders.layout) && /[\\/][^\\/]*\.liquid$/gi.test(name);
};

export const isSectionGroup = (name: string) =>
  name.includes(config.folders.templates) && /[\\/]section-groups[\\/][^\\/]*\.json$/gi.test(name);

export const isConfig = (name: string) => name.includes(config.folders.config) && /[\\/][^\\/]*\.json$/gi.test(name);

export const isTemplate = (name: string) => name.includes(config.folders.templates) && /[\\/][^\\/]*\.json$/gi.test(name);

export const isCustomerTemplate = (name: string) =>
  name.includes(config.folders.templates) && /[\\/]customers[\\/][^\\/]*\.json$/gi.test(name);

export const isGiftCard = (name: string) => name.includes(config.folders.templates) && /[\\/]gift_card\.liquid$/gi.test(name);

/* gift_card.liquid is excluded: generate-liquid-files owns it so its <t> tags still get extracted to locales. */
export const isLiquidTemplate = (name: string) =>
  name.includes(config.folders.templates) && /[\\/][^\\/]*\.liquid$/gi.test(name) && !isGiftCard(name);

export const isTargetDynamicJs = (name: string) =>
  /[\\/]assets[\\/](__section--|__block--|__classic_block--)[^\\/]*.js$/gi.test(name);

export const isLiquid = (name: string) =>
  isSectionLiquid(name) ||
  isBlockLiquid(name) ||
  isClassicBlockLiquid(name) ||
  isCardsLiquid(name) ||
  isSnippet(name) ||
  isLayout(name) ||
  isGiftCard(name);
