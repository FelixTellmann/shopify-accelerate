import chalk from "chalk";
import equal from "fast-deep-equal/es6";

// @ts-ignore
import { ESLint } from "fx-style/eslint";
import importFresh from "import-fresh";

import fs from "node:fs";
import path from "node:path";
import { formatObject } from "../utils/format-object";
import type { Sections } from "types/sections";
import type { ShopifySection, ShopifySectionBlock, ShopifySectionBlockPresetMap, ShopifySectionGeneratedThemeBlock, ShopifySectionPreset, ShopifyThemeBlock } from "types/shopify";
import { config } from "../../shopify-accelerate";
import { readFile, writeCompareFile } from "../utils/fs";
import { toCamelCase, toPascalCase } from "../utils/to-pascal-case";
import { generateCardsTypes } from "./generate-card-types";
import { generateClassicBlocksTypes } from "./generate-classic-blocks-types";
import { generateLiquidFiles } from "./generate-liquid-files";
import { generateSchemaLocales } from "./generate-schema-locales";
import { generateSchemaVariables } from "./generate-schema-variables";
import { generateSectionsTypes } from "./generate-section-types";
import { generateSettingTypes } from "./generate-setting-types";
import { generateThemeBlocksTypes } from "./generate-theme-blocks-types";
import { getSchemaSources, getTargets } from "./parse-files";
import { parseLocales } from "./parse-locales";

// Instance (template) settings carry a `hidden_name_backup` value; schema settings are an
// array that never does. Read it defensively so schema-shaped settings yield undefined.
const getHiddenNameBackup = (settings: unknown): string | undefined =>
  settings && typeof settings === "object" && !Array.isArray(settings) && "hidden_name_backup" in settings
    ? (settings as { hidden_name_backup?: string }).hidden_name_backup
    : undefined;

/**
 * Formats block type by removing leading underscores and ensuring consistency
 */
const formatBlockType = (blockType: string, folder: string) =>
  /[^_]__/gi.test(blockType)
    ? blockType
    : `_${folder.replace(/^_*/g, "")}__${blockType}`.replace(
        `_${folder.replace(/^_*/g, "")}___${folder.replace(/^_*/g, "")}__`,
        `_${folder.replace(/^_*/g, "")}__`
      );

const mapPresetBlocks = (
  rootBlocks: ShopifySectionPreset["blocks"],
  containerSchema: (ShopifySection & { path: string; folder: string }) | (ShopifyThemeBlock & { path: string; folder: string }),
  schema?: any,
  debug_name?: string
) => {
  schema ??= structuredClone(containerSchema);

  if (schema?.blocks) {
    schema.blocks = schema?.blocks?.reduce((acc, block) => {
      if ("theme_block" in block && block.theme_block) {
        acc.push({
          ...block,
          name: block.name ?? getHiddenNameBackup(block?.settings),
        });
        return acc;
      }

      if (block.type === "@section_blocks") {
        schema.blocks.forEach((rootBlock) => {
          if (rootBlock.theme_block) {
            acc.push({
              ...rootBlock,
              name: rootBlock.name ?? getHiddenNameBackup(rootBlock?.settings),
            });
          } else {
            acc.push(rootBlock);
          }
        });

        return acc;
      }

      if (block.type === "@theme") {
        Object.values(config.sources.blockSchemas).forEach((themeBlock) => {
          if (!/^_/gi.test(themeBlock.type)) {
            const themeBlockParsed = structuredClone(themeBlock);
            acc.push({ ...themeBlockParsed, name: themeBlockParsed.name ?? getHiddenNameBackup(themeBlockParsed?.settings) });
          }
        });
        return acc;
      }

      if (!block.name && !["@app", "@classic_theme", "@theme"].includes(block.type)) {
        const potentialBlock = structuredClone(config.sources.blockSchemas[toCamelCase(block.type)]);

        if (potentialBlock?.folder === block.type) {
          acc.push({
            ...potentialBlock,
            type: potentialBlock.folder,
            themeBlock: { ...potentialBlock, type: potentialBlock.folder },
            name: potentialBlock.name ?? getHiddenNameBackup(potentialBlock?.settings),
          });
          return acc;
        }

        if (!potentialBlock && block.type.includes("__")) {
          const sectionKey = toCamelCase(block.type.split("__")[0]);
          const section = structuredClone(config.sources.sectionSchemas[sectionKey]);

          const findSectionBlock = (blocks: any[], targetType: string, withSettings = false): any | undefined => {
            for (const sBlock of blocks) {
              const formattedType = sBlock.theme_block ? formatBlockType(sBlock.type, section.folder) : sBlock.type;

              if (formattedType === targetType) return { ...sBlock, type: formattedType };

              if (Array.isArray(sBlock.blocks)) {
                const nestedBlock = findSectionBlock(sBlock.blocks as any[], targetType, withSettings);
                if (withSettings) {
                  if (nestedBlock && nestedBlock.settings) return nestedBlock;
                } else {
                  if (nestedBlock) return nestedBlock;
                }
              }
            }
            return undefined;
          };

          const sectionBlock = section?.blocks
            ? findSectionBlock(section.blocks as any[], block.type, true) || findSectionBlock(section.blocks as any[], block.type)
            : undefined;

          if (sectionBlock) {
            acc.push({
              ...sectionBlock,
              cross_section: true,
              themeBlock: section,
              name: sectionBlock.name ?? getHiddenNameBackup(sectionBlock?.settings),
            });
            return acc;
          }
        }
      }
      acc.push({ ...block, name: block.name ?? getHiddenNameBackup(block?.settings) });
      return acc;
    }, []);
  }

  if (containerSchema?.blocks) {
    containerSchema.blocks = containerSchema?.blocks?.reduce((acc, block) => {
      if ("theme_block" in block && block.theme_block) {
        acc.push({
          ...block,
          type: "cross_section" in block ? block.type : formatBlockType(block.type, schema?.folder),
          name: block.name ?? getHiddenNameBackup(block?.settings),
        });
        return acc;
      }

      if (block.type === "@section_blocks") {
        schema.blocks.forEach((rootBlock) => {
          if (rootBlock.theme_block) {
            acc.push({
              ...rootBlock,
              type: formatBlockType(rootBlock.type, schema?.folder),
              name: rootBlock.name ?? getHiddenNameBackup(rootBlock?.settings),
            });
          } else {
            acc.push({
              ...rootBlock,
              name: rootBlock.name ?? getHiddenNameBackup(rootBlock?.settings),
            });
          }
        });
        return acc;
      }

      if (block.type === "@theme") {
        Object.values(config.sources.blockSchemas).forEach((themeBlock) => {
          if (!/^_/gi.test(themeBlock.type)) {
            const themeBlockParsed = structuredClone(themeBlock);
            acc.push({ ...themeBlockParsed, name: themeBlockParsed.name ?? getHiddenNameBackup(themeBlockParsed?.settings) });
          }
        });
        return acc;
      }

      if (!block.name && !["@app", "@classic_theme", "@theme"].includes(block.type)) {
        const potentialBlock = structuredClone(config.sources.blockSchemas[toCamelCase(block.type)]);

        if (potentialBlock?.folder === block.type) {
          acc.push({
            ...potentialBlock,
            type: potentialBlock.folder,
            themeBlock: { ...potentialBlock, type: potentialBlock.folder },
            name: potentialBlock.name ?? getHiddenNameBackup(potentialBlock?.settings),
          });
          return acc;
        }

        if (!potentialBlock && block.type.includes("__")) {
          const sectionKey = toCamelCase(block.type.split("__")[0]);
          const section = structuredClone(config.sources.sectionSchemas[sectionKey]);

          const findSectionBlock = (blocks: any[], targetType: string, withSettings = false): any | undefined => {
            for (const sBlock of blocks) {
              const formattedType = sBlock.theme_block ? formatBlockType(sBlock.type, section.folder) : sBlock.type;

              if (formattedType === targetType) return { ...sBlock, type: formattedType };

              if (Array.isArray(sBlock.blocks)) {
                const nestedBlock = findSectionBlock(sBlock.blocks as any[], targetType, withSettings);
                if (withSettings) {
                  if (nestedBlock && nestedBlock.settings) return nestedBlock;
                } else {
                  if (nestedBlock) return nestedBlock;
                }
              }
            }
            return undefined;
          };

          const sectionBlock = section?.blocks
            ? findSectionBlock(section.blocks as any[], block.type, true) || findSectionBlock(section.blocks as any[], block.type)
            : undefined;

          if (sectionBlock)
            acc.push({
              ...sectionBlock,
              themeBlock: section,
              name: sectionBlock.name ?? getHiddenNameBackup(sectionBlock?.settings),
            });
        }

        return acc;
      }

      acc.push({ ...block, name: block.name ?? getHiddenNameBackup(block?.settings) });
      return acc;
    }, []);
  }

  return Object.entries(rootBlocks)
    ?.map(([block_id, { block_order, disabled, blocks, ...block }]) => {
      if (block?.static) {
        block.id = block_id;
      }
      const returnBlock = {
        ...block,
      };

      if (blocks) {
        const nextContainerSchema = containerSchema?.blocks?.find((containerBlock) => containerBlock.type === block.type) as
          | (ShopifySection & { path: string; folder: string; type?: string; themeBlock: ShopifySection })
          | (ShopifyThemeBlock & { path: string; folder: string; type?: string; themeBlock: ShopifySection });

        returnBlock.blocks = mapPresetBlocks(blocks, nextContainerSchema, nextContainerSchema?.themeBlock || schema, debug_name);
      }

      if (returnBlock?.settings) {
        const blockSchema = containerSchema?.blocks?.find((containerBlock) => containerBlock.type === block.type);

        returnBlock.settings = Object.entries(returnBlock.settings).reduce((acc, [key, value]) => {
          if (key === "generate_block_presets") {
            acc[key] = "never";
            return acc;
          }
          const blockSchemaSettings = blockSchema?.settings?.find((setting) => "id" in setting && setting?.id === key);
          if (blockSchemaSettings) {
            if (key === "infinite_scroll" && typeof value === "boolean") {
              acc[key] = value ? "all" : "off";
              return acc;
            }
            if (typeof value === "string" && /^shopify:\/\/files\/videos/gi.test(value)) return acc;
            if (typeof value === "string" && /\{\{\s*(product|collection|page|article|blog)\.?\s?[^}]*\}\}/gi.test(value)) {
              value = value.replace(/(\{\{\s*)(product|collection|page|article|blog)(\.?\s?[^}]*\}\})/gi, "$1closest.$2$3");
            }
            if (blockSchemaSettings?.type === "article") return acc;
            acc[key] = value;
            return acc;
          }
          return acc;
        }, {});
      }
      return returnBlock;
    })
    ?.filter((childBlock) => {
      if (
        containerSchema?.blocks?.length &&
        containerSchema?.blocks?.some((containerBlock) => containerBlock.type === childBlock.type)
      ) {
        return true;
      }

      return false;
    });
};

export const syncPresets = async (watch = false) => {
  if (!config.sync_presets) {
    return false;
  }
  const startTime = Date.now();
  const completed = [];

  const count = 0;
  const templates = new Set([
    ...config.targets.sectionGroups,
    ...config.targets.configs,
    ...config.targets.templates,
    ...config.targets.customerTemplates,
  ]);

  const templateData: { sections: Sections; order: string[] }[] = [];

  templates.forEach((template) => {
    if (/[\\/]config[\\/]/gi.test(template)) return;
    const content = readFile(template);
    eval(`"use strict"; templateData.push(${content})`);
  });

  const presets: Record<
    string,
    {
      schema: ShopifySection & { path: string; folder: string };
      named: Record<string, ShopifySectionPreset[]>;
      unnamed: Record<string, ShopifySectionPreset[]>;
      primary: Record<string, ShopifySectionPreset[]>;
      development: Record<string, ShopifySectionPreset[]>;
      override: Record<string, ShopifySectionPreset[]>;
      no_existing_sections?: boolean;
      block_presets: {
        primary: Record<string, ShopifySectionPreset[]>;
        override: Record<string, ShopifySectionPreset[]>;
      };
    }
  > = {};

  const blockPresets: Record<
    string,
    {
      schema: ShopifyThemeBlock & { path: string; folder: string };
      named: Record<string, ShopifySectionPreset[]>;
      unnamed: Record<string, ShopifySectionPreset[]>;
      primary: Record<string, ShopifySectionPreset[]>;
      development: Record<string, ShopifySectionPreset[]>;
      override: Record<string, ShopifySectionPreset[]>;
      no_existing_sections?: boolean;
      block_presets: {
        primary: Record<string, ShopifySectionPreset[]>;
        override: Record<string, ShopifySectionPreset[]>;
      };
    }
  > = {};

  Object.values(config.sources.sectionSchemas).forEach((entry) => {
    const type = entry.folder.replace(/^_*/gi, "");

    if (!presets[type]) {
      const schema = structuredClone(entry);

      presets[type] ??= {
        schema: schema,
        named: {},
        unnamed: {},
        primary: {},
        development: {},
        override: {},
        block_presets: {
          primary: {},
          override: {},
        },
        no_existing_sections: true,
      };
    }
  });

  Object.values(config.sources.blockSchemas).forEach((entry) => {
    const type = entry.folder;

    if (!blockPresets[type]) {
      const schema = structuredClone(entry);

      blockPresets[type] ??= {
        schema: schema,
        named: {},
        unnamed: {},
        primary: {},
        development: {},
        override: {},
        block_presets: {
          primary: {},
          override: {},
        },
        no_existing_sections: true,
      };
    }
  });

  templateData.forEach(({ sections }) => {
    if (!sections) return;
    Object.values(sections).forEach((section) => {
      const sectionSchema = structuredClone(config.sources.sectionSchemas[toCamelCase(section.type)]);
      if (!sectionSchema) return;

      if (!sectionSchema.name) {
        sectionSchema.name = getHiddenNameBackup(sectionSchema?.settings) ?? "";
      }

      const sectionType = section.type;
      const generatePresets = section.settings?.generate_presets;

      // console.log({ sectionId, test: section.name });

      presets[sectionType] ??= {
        schema: sectionSchema,
        named: {},
        unnamed: {},
        primary: {},
        development: {},
        override: {},
        block_presets: {
          primary: {},
          override: {},
        },
      };

      const category =
        generatePresets === "always"
          ? "primary"
          : generatePresets === "development"
          ? "development"
          : generatePresets === "manual_override"
          ? "override"
          : section.name && section.name !== sectionSchema.name
          ? "named"
          : "unnamed";

      if (category !== "unnamed") {
        presets[sectionType][category][section.name] ??= [];
        presets[sectionType][category][section.name].push(section);
      }

      const parseBlocks = (currentPreset, sectionType, presets) => {
        if (currentPreset.blocks && Object.keys(currentPreset.blocks ?? {})?.length) {
          Object.values(currentPreset.blocks).forEach((blockPreset: ShopifySectionPreset["blocks"][number]) => {
            // @ts-ignore
            const match = blockPreset.type?.match(/^_(.*?)__/);
            const currentSectionType = match ? match[1] : sectionType;
            const globalBlockType = config.sources.blockSchemas[toCamelCase(blockPreset.type)];
            const generatePresets = blockPreset.settings?.generate_block_presets;

            if (!match && globalBlockType && sectionSchema?.blocks?.some((block) => block?.type === "@theme")) {
              blockPresets[blockPreset.type] ??= {
                schema: blockPreset,
                named: {},
                unnamed: {},
                primary: {},
                development: {},
                override: {},
                block_presets: {
                  primary: {},
                  override: {},
                },
              };

              const name = blockPreset.name;
              const category =
                generatePresets === "always"
                  ? "primary"
                  : generatePresets === "manual_override"
                  ? "override"
                  : blockPreset.name && blockPreset.name !== globalBlockType.name
                  ? "named"
                  : "unnamed";

              if (category !== "unnamed") {
                blockPresets[blockPreset.type][category][name] ??= [];
                blockPresets[blockPreset.type][category][name].push(blockPreset);
              }

              parseBlocks(blockPreset, blockPreset.type, blockPresets);
            }

            if (match && presets[currentSectionType] && generatePresets === "always") {
              presets[currentSectionType].block_presets["primary"][blockPreset.type] ??= [];
              presets[currentSectionType].block_presets["primary"][blockPreset.type].push(blockPreset);
            }
            if (match && presets[currentSectionType] && generatePresets === "manual_override") {
              presets[currentSectionType].block_presets["override"][blockPreset.type] ??= [];
              presets[currentSectionType].block_presets["override"][blockPreset.type].push(blockPreset);
            }

            parseBlocks(blockPreset, sectionType, presets);
          });
        }
      };
      parseBlocks(section, sectionType, presets);
    });
  });

  const blockImports = new Map();
  const sectionImports = new Map();

  await new Promise((resolve, reject) => {
    const sectionPromises = Object.entries(presets ?? {}).map(
      async ([type, { schema, named, unnamed, primary, development, override, no_existing_sections, block_presets }]) => {
        const schema_file_path = schema.folder.replace(/^_*/gi, "");
        const filePath = path.join(config.folders.sections, schema.folder, "_presets.ts");
        const file = sectionImports.get(filePath) ?? importFresh(filePath);
        sectionImports.set(filePath, file);
        const existingPresets = file[`${toCamelCase(type)}Presets`] ?? [];
        const existingBlockPresets = file[`${toCamelCase(type)}BlockPresets`] as {
          [T: string]: ShopifySectionPreset[];
        };
        const sectionBlocksPresetOutput = {};
        const sectionPresetOutput = [];

        const addPresets = (presetGroup: Record<string, ShopifySectionPreset[]>, developmentOnly = false, override = false) => {
          Object.entries(presetGroup).forEach(([name, presets]) => {
            const sectionFoundIndex = sectionPresetOutput.findIndex((preset) => preset.name === name);
            if (sectionFoundIndex !== -1 && !override) {
              return;
            }

            const preset = presets[0];
            const presetObject: ShopifySectionPreset = {
              name,
              ...(override && { manual_preset: true }),
              ...(developmentOnly && { development_only: true }),
            };
            if (preset.manual_preset || override) {
              presetObject.manual_preset = true;
            }

            if (preset.settings) {
              presetObject.settings = Object.entries(preset.settings).reduce((acc, [key, value]) => {
                const blockSchemaSettings = schema.settings?.find((setting) => "id" in setting && setting?.id === key);
                if (blockSchemaSettings) {
                  if (key === "infinite_scroll" && typeof value === "boolean") {
                    acc[key] = value ? "all" : "off";
                    return acc;
                  }
                  if (typeof value === "string" && /^shopify:\/\/files\/videos/gi.test(value)) return acc;
                  if (typeof value === "string" && /\{\{\s*(product|collection|page|article|blog)\.?\s?[^}]*\}\}/gi.test(value)) {
                    value = value.replace(/(\{\{\s*)(product|collection|page|article|blog)(\.?\s?[^}]*\}\})/gi, "$1closest.$2$3");
                  }
                  if (blockSchemaSettings?.type === "article") return acc;
                  acc[key] = value;
                }
                return acc;
              }, {});
              if ("generate_presets" in presetObject.settings) {
                delete presetObject.settings.generate_presets;
              }
              if ("generate_block_presets" in presetObject.settings) {
                delete presetObject.settings.generate_block_presets;
              }
              if ("category_name" in presetObject.settings && presetObject.settings.category_name) {
                presetObject.category = presetObject.settings.category_name as string;
                presetObject.settings.category_name = "";
              }
            }
            if (preset.blocks) {
              // @ts-ignore
              presetObject.blocks = mapPresetBlocks(preset.blocks, structuredClone(schema), undefined, name);
            }

            if (sectionFoundIndex !== -1 && override) {
              sectionPresetOutput[sectionFoundIndex] = presetObject;
            } else {
              sectionPresetOutput.push(presetObject);
            }
          });
        };

        existingPresets?.forEach((preset, i, arr) => {
          if (preset.manual_preset) {
            addPresets({ [preset.name]: [preset] });
          }
          if (no_existing_sections && !sectionPresetOutput.length && !arr.some((p) => p.manual_preset)) {
            const bestOption = arr.find((p) => p.name === schema.name);
            if (bestOption) {
              addPresets({ [bestOption.name]: [bestOption] });
            } else {
              addPresets({ [preset.name]: [preset] });
            }
          }
        });

        // Process all categories efficiently
        addPresets(primary);
        if (config.all_presets) {
          addPresets(named, true);
        }
        // addPresets(named, true);
        // addPresets(unnamed, true);
        // addPresets(development, true);
        addPresets(override, false, true);

        if (sectionPresetOutput.length === 0) {
          sectionPresetOutput.push({ name: schema.name });
        }

        const findBlockById = (s, t) => {
          // Check current block
          if (s?.name && `_${schema_file_path}__${s.type?.replace(`_${schema_file_path}__`, "")}` === t) {
            return s;
          }

          // Check nested blocks
          if (Array.isArray(s.blocks)) {
            for (const block of s.blocks) {
              const result = findBlockById(block, t);
              if (result) return result; // short-circuit on match
            }
          }

          return null;
        };

        const addBlockPresets = (type, blockPresets, existingPreset = false, override = false) => {
          const blockSchema = findBlockById(schema, type);

          if (blockSchema && blockPresets?.length) {
            sectionBlocksPresetOutput[type] ??= [];

            blockPresets.forEach((preset) => {
              const name = existingPreset ? preset.name : preset.settings?.title || preset.name || blockSchema.name;
              const blockFoundIndex = sectionBlocksPresetOutput[type].findIndex((preset) => preset.name === name);

              if (blockFoundIndex !== -1 && !override) {
                return;
              }

              const presetObject: ShopifySectionPreset = {
                name,
              };

              if (preset.manual_preset || override) {
                presetObject.manual_preset = true;
              }

              if (preset.settings) {
                presetObject.settings = Object.entries(preset.settings).reduce((acc, [key, value]) => {
                  const blockSchemaSettings = blockSchema.settings?.find((setting) => "id" in setting && setting?.id === key);
                  if (blockSchemaSettings) {
                    if (key === "infinite_scroll" && typeof value === "boolean") {
                      acc[key] = value ? "all" : "off";
                      return acc;
                    }
                    if (typeof value === "string" && /^shopify:\/\/files\/videos/gi.test(value)) return acc;
                    if (
                      typeof value === "string" &&
                      /\{\{\s*(product|collection|page|article|blog)\.?\s?[^}]*\}\}/gi.test(value)
                    ) {
                      value = value.replace(
                        /(\{\{\s*)(product|collection|page|article|blog)(\.?\s?[^}]*\}\})/gi,
                        "$1closest.$2$3"
                      );
                    }
                    if (blockSchemaSettings?.type === "article") return acc;
                    acc[key] = value;
                  }
                  return acc;
                }, {});

                if ("generate_presets" in presetObject.settings) {
                  delete presetObject.settings.generate_presets;
                }
                if ("generate_block_presets" in presetObject.settings) {
                  delete presetObject.settings.generate_block_presets;
                }
                if ("category_name" in presetObject.settings && presetObject.settings.category_name) {
                  presetObject.category = presetObject.settings.category_name as string;
                  presetObject.settings.category_name = "";
                }
              }
              if (preset.blocks) {
                // @ts-ignore

                presetObject.blocks = mapPresetBlocks(preset.blocks, structuredClone(blockSchema), structuredClone(schema));
              }

              if (blockFoundIndex !== -1 && override) {
                sectionBlocksPresetOutput[type][blockFoundIndex] = presetObject;
              } else {
                sectionBlocksPresetOutput[type].push(presetObject);
              }
            });
          }
        };

        if (existingBlockPresets && typeof existingBlockPresets === "object") {
          Object.entries(existingBlockPresets)?.forEach(([type, presets]) => {
            addBlockPresets(
              type,
              presets.filter((p) => p.manual_preset),
              true
            );

            if (
              !block_presets.primary?.[type]?.length &&
              !block_presets.override?.[type]?.length &&
              !sectionBlocksPresetOutput[type]
            ) {
              addBlockPresets(type, [presets[0]], true);
            }
          });
        }

        Object.entries(block_presets.primary).forEach(([type, blockPresets]) => {
          addBlockPresets(type, blockPresets, false, false);
        });
        Object.entries(block_presets.override).forEach(([type, blockPresets]) => {
          addBlockPresets(type, blockPresets, false, true);
        });

        // **Deep Equality Check to Avoid Unnecessary Updates**
        const existingSourceJson = existingPresets.map((preset) => ({
          name: preset.name,
          settings: preset.settings ?? {},
          blocks: preset.blocks ?? [],
          development_only: preset.development_only ?? false,
          ...(preset.category ? { category: preset.category } : {}),
        }));

        const newSourceJson = sectionPresetOutput.map((preset) => ({
          name: preset.name,
          settings: preset.settings ?? {},
          blocks: preset.blocks ?? [],
          development_only: preset.development_only ?? false,
          ...(preset.category ? { category: preset.category } : {}),
        }));

        if (
          existingBlockPresets &&
          equal(existingSourceJson, newSourceJson) &&
          equal(existingBlockPresets, sectionBlocksPresetOutput)
        ) {
          // console.log("No Preset Change found");
          completed.push(false);
          return; // **Skip writing & ESLint if unchanged**
        }
        console.log(`Section Preset Update: ${type}`);

        // Prepare new output file content
        const outputArr = [];

        outputArr.push(`import type { ThemeBlocks } from "types/blocks.js";`);
        outputArr.push(`import type { ShopifySectionPreset, ShopifySectionBlockPresetMap } from "types/shopify.js";`);
        outputArr.push(`import type { ${toPascalCase(type)}Section } from "types/sections.js";`);
        outputArr.push(``);
        outputArr.push(
          `export const ${toCamelCase(type)}Presets: ShopifySectionPreset<${toPascalCase(type)}Section>[] = ${formatObject(
            sectionPresetOutput,
            2
          )};`
        );

        if (!Object.keys(sectionBlocksPresetOutput)?.length) {
          outputArr.push(``);
          outputArr.push(
            `export const ${toCamelCase(
              type
            )}BlockPresets: ShopifySectionBlockPresetMap<Extract<ThemeBlocks, { type: \`_${schema_file_path}__\${string}\` }>> = {};`
          );
        }

        if (Object.keys(sectionBlocksPresetOutput)?.length) {
          outputArr.push(``);
          outputArr.push(
            `export const ${toCamelCase(
              type
            )}BlockPresets: ShopifySectionBlockPresetMap<Extract<ThemeBlocks, { type: \`_${schema_file_path}__\${string}\` }>> = ${formatObject(
              sectionBlocksPresetOutput,
              2
            )};`
          );
        }

        const output = outputArr.join("\n");

        // Save the new output to a temporary file for ESLint
        const tempFilePath = path.join(config.project_root, "@utils", "temp", `${type}__temp.ts`);
        fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });
        fs.writeFileSync(tempFilePath, output, "utf8");

        // Run ESLint Fix
        try {
          const eslint = new ESLint({
            fix: true,
            ignore: false,
            cwd: path.join(config.project_root),
            overrideConfigFile: path.join(config.project_root, "package.json"),
            overrideConfig: {
              rules: {
                "comma-dangle": ["error", "always-multiline"],
                "prettier/prettier": [
                  "error",
                  {
                    plugins: ["prettier-plugin-tailwindcss"],
                    trailingComma: "es5",
                    arrowParens: "always",
                    singleQuote: false,
                    bracketSpacing: true,
                    printWidth: 130,
                    indentChains: true,
                    exportCurlySpacing: true,
                    importCurlySpacing: true,
                    allowBreakAfterOperator: false,
                    breakLongMethodChains: true,
                    importFormatting: "oneline",
                    endOfLine: "auto",
                    ignorePath: null,
                    withNodeModules: true,
                  },
                ],
              },
              ignorePatterns: ["!node_modules/**"], // Force ESLint to include fx-style
            },
          });

          const results = await eslint.lintFiles([tempFilePath]);
          const formattedOutput = results[0]?.output ?? output;

          fs.unlinkSync(tempFilePath);
          writeCompareFile(filePath, formattedOutput, (updated) => {
            if (updated) completed.push(true);
          });
        } catch (error) {
          console.error(error);
          completed.push(false);
        }
      }
    );

    const blockPromises = Object.entries(blockPresets ?? {}).map(
      async ([type, { schema, named, unnamed, primary, development, override, no_existing_sections, block_presets }]) => {
        const schema_file_path = schema.folder.replace(/^_*/gi, "");
        const filePath = path.join(config.folders.blocks, schema.folder, "_presets.ts");
        const file = blockImports.get(filePath) ?? importFresh(filePath);
        blockImports.set(filePath, file);
        const existingPresets = file[`${toCamelCase(type)}Presets`] ?? [];
        const existingBlockPresets = file[`${toCamelCase(type)}BlockPresets`] as {
          [T: string]: ShopifySectionPreset[];
        };
        const sectionBlocksPresetOutput = {};
        const blockPresetOutput = [];

        const addPresets = (presetGroup: Record<string, ShopifySectionPreset[]>, developmentOnly = false, override = false) => {
          Object.entries(presetGroup).forEach(([name, presets]) => {
            const sectionFoundIndex = blockPresetOutput.findIndex((preset) => preset.name === name);
            if (sectionFoundIndex !== -1 && !override) {
              return;
            }

            const preset = presets[0];
            const presetObject: ShopifySectionPreset = {
              name,
              ...(override && { manual_preset: true }),
              ...(developmentOnly && { development_only: true }),
            };
            if (preset.manual_preset || override) {
              presetObject.manual_preset = true;
            }

            if (preset.settings) {
              presetObject.settings = Object.entries(preset.settings).reduce((acc, [key, value]) => {
                const blockSchemaSettings = schema.settings?.find((setting) => "id" in setting && setting?.id === key);
                if (blockSchemaSettings) {
                  if (key === "infinite_scroll" && typeof value === "boolean") {
                    acc[key] = value ? "all" : "off";
                    return acc;
                  }
                  if (typeof value === "string" && /^shopify:\/\/files\/videos/gi.test(value)) return acc;
                  if (typeof value === "string" && /\{\{\s*(product|collection|page|article|blog)\.?\s?[^}]*\}\}/gi.test(value)) {
                    value = value.replace(/(\{\{\s*)(product|collection|page|article|blog)(\.?\s?[^}]*\}\})/gi, "$1closest.$2$3");
                  }
                  if (blockSchemaSettings?.type === "article") return acc;
                  acc[key] = value;
                }
                return acc;
              }, {});
              if ("generate_presets" in presetObject.settings) {
                delete presetObject.settings.generate_presets;
              }
              if ("generate_block_presets" in presetObject.settings) {
                delete presetObject.settings.generate_block_presets;
              }
              if ("category_name" in presetObject.settings && presetObject.settings.category_name) {
                presetObject.category = presetObject.settings.category_name as string;
                presetObject.settings.category_name = "";
              }
            }
            if (preset.blocks) {
              // @ts-ignore
              presetObject.blocks = mapPresetBlocks(preset.blocks, structuredClone(schema), undefined, name);
            }

            if (sectionFoundIndex !== -1 && override) {
              blockPresetOutput[sectionFoundIndex] = presetObject;
            } else {
              blockPresetOutput.push(presetObject);
            }
          });
        };

        existingPresets?.forEach((preset, i, arr) => {
          if (preset.manual_preset) {
            addPresets({ [preset.name]: [preset] });
          }
          if (no_existing_sections && !blockPresetOutput.length && !arr.some((p) => p.manual_preset)) {
            const bestOption = arr.find((p) => p.name === schema.name);
            if (bestOption) {
              addPresets({ [bestOption.name]: [bestOption] });
            } else {
              addPresets({ [preset.name]: [preset] });
            }
          }
        });

        // Process all categories efficiently
        addPresets(primary);
        if (config.all_presets) {
          addPresets(named, true);
        }
        // addPresets(named, true);
        // addPresets(unnamed, true);
        // addPresets(development, true);
        addPresets(override, false, true);

        if (blockPresetOutput.length === 0) {
          blockPresetOutput.push({ name: schema.name });
        }

        const findBlockById = (s, t) => {
          // Check current block
          if (s?.name && `_${schema_file_path}__${s.type?.replace(`_${schema_file_path}__`, "")}` === t) {
            return s;
          }

          // Check nested blocks
          if (Array.isArray(s.blocks)) {
            for (const block of s.blocks) {
              const result = findBlockById(block, t);
              if (result) return result; // short-circuit on match
            }
          }

          return null;
        };

        const addBlockPresets = (type, blockPresets, existingPreset = false, override = false) => {
          const blockSchema = findBlockById(schema, type);

          if (blockSchema && blockPresets?.length) {
            sectionBlocksPresetOutput[type] ??= [];

            blockPresets.forEach((preset) => {
              const name = existingPreset ? preset.name : preset.settings?.title || preset.name || blockSchema.name;
              const blockFoundIndex = sectionBlocksPresetOutput[type].findIndex((preset) => preset.name === name);

              if (blockFoundIndex !== -1 && !override) {
                return;
              }

              const presetObject: ShopifySectionPreset = {
                name,
              };

              if (preset.manual_preset || override) {
                presetObject.manual_preset = true;
              }

              if (preset.settings) {
                presetObject.settings = Object.entries(preset.settings).reduce((acc, [key, value]) => {
                  const blockSchemaSettings = blockSchema.settings?.find((setting) => "id" in setting && setting?.id === key);
                  if (blockSchemaSettings) {
                    if (key === "infinite_scroll" && typeof value === "boolean") {
                      acc[key] = value ? "all" : "off";
                      return acc;
                    }
                    if (typeof value === "string" && /^shopify:\/\/files\/videos/gi.test(value)) return acc;
                    if (
                      typeof value === "string" &&
                      /\{\{\s*(product|collection|page|article|blog)\.?\s?[^}]*\}\}/gi.test(value)
                    ) {
                      value = value.replace(
                        /(\{\{\s*)(product|collection|page|article|blog)(\.?\s?[^}]*\}\})/gi,
                        "$1closest.$2$3"
                      );
                    }
                    if (blockSchemaSettings?.type === "article") return acc;
                    acc[key] = value;
                  }
                  return acc;
                }, {});

                if ("generate_presets" in presetObject.settings) {
                  delete presetObject.settings.generate_presets;
                }
                if ("generate_block_presets" in presetObject.settings) {
                  delete presetObject.settings.generate_block_presets;
                }
                if ("category_name" in presetObject.settings && presetObject.settings.category_name) {
                  presetObject.category = presetObject.settings.category_name as string;
                  presetObject.settings.category_name = "";
                }
              }
              if (preset.blocks) {
                // @ts-ignore

                presetObject.blocks = mapPresetBlocks(preset.blocks, structuredClone(blockSchema), structuredClone(schema));
              }

              if (blockFoundIndex !== -1 && override) {
                sectionBlocksPresetOutput[type][blockFoundIndex] = presetObject;
              } else {
                sectionBlocksPresetOutput[type].push(presetObject);
              }
            });
          }
        };

        if (existingBlockPresets && typeof existingBlockPresets === "object") {
          Object.entries(existingBlockPresets)?.forEach(([type, presets]) => {
            addBlockPresets(
              type,
              presets.filter((p) => p.manual_preset),
              true
            );

            if (
              !block_presets.primary?.[type]?.length &&
              !block_presets.override?.[type]?.length &&
              !sectionBlocksPresetOutput[type]
            ) {
              addBlockPresets(type, [presets[0]], true);
            }
          });
        }

        Object.entries(block_presets.primary).forEach(([type, blockPresets]) => {
          addBlockPresets(type, blockPresets, false, false);
        });
        Object.entries(block_presets.override).forEach(([type, blockPresets]) => {
          addBlockPresets(type, blockPresets, false, true);
        });

        // **Deep Equality Check to Avoid Unnecessary Updates**
        const existingSourceJson = existingPresets.map((preset) => ({
          name: preset.name,
          settings: preset.settings ?? {},
          blocks: preset.blocks ?? [],
          development_only: preset.development_only ?? false,
          ...(preset.category ? { category: preset.category } : {}),
        }));

        const newSourceJson = blockPresetOutput.map((preset) => ({
          name: preset.name,
          settings: preset.settings ?? {},
          blocks: preset.blocks ?? [],
          development_only: preset.development_only ?? false,
          ...(preset.category ? { category: preset.category } : {}),
        }));

        if (
          existingBlockPresets &&
          equal(existingSourceJson, newSourceJson) &&
          equal(existingBlockPresets, sectionBlocksPresetOutput)
        ) {
          // console.log("No Preset Change found");
          completed.push(false);
          return; // **Skip writing & ESLint if unchanged**
        }
        console.log(`Block Preset Update: ${type}`);

        // Prepare new output file content
        const outputArr = [];

        outputArr.push(`import type { ${toPascalCase(type)}Block, ThemeBlocks } from "types/blocks.js";`);
        outputArr.push(`import type { ShopifySectionPreset, ShopifySectionBlockPresetMap } from "types/shopify.js";`);
        outputArr.push(``);
        outputArr.push(
          `export const ${toCamelCase(type)}Presets: ShopifySectionPreset<${toPascalCase(type)}Block>[] = ${formatObject(
            blockPresetOutput,
            2
          )};`
        );

        if (!Object.keys(sectionBlocksPresetOutput)?.length) {
          outputArr.push(``);
          outputArr.push(
            `export const ${toCamelCase(
              type
            )}BlockPresets: ShopifySectionBlockPresetMap<Extract<ThemeBlocks, { type: \`_${schema_file_path}__\${string}\` }>> = {};`
          );
        }

        if (Object.keys(sectionBlocksPresetOutput)?.length) {
          outputArr.push(``);
          outputArr.push(
            `export const ${toCamelCase(
              type
            )}BlockPresets: ShopifySectionBlockPresetMap<Extract<ThemeBlocks, { type: \`_${schema_file_path}__\${string}\` }>> = ${formatObject(
              sectionBlocksPresetOutput,
              2
            )};`
          );
        }

        const output = outputArr.join("\n");

        // Save the new output to a temporary file for ESLint
        const tempFilePath = path.join(config.project_root, "@utils", "temp", `block_${type}__temp.ts`);
        fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });
        fs.writeFileSync(tempFilePath, output, "utf8");

        // Run ESLint Fix
        try {
          const eslint = new ESLint({
            fix: true,
            ignore: false,
            cwd: path.join(config.project_root),
            overrideConfigFile: path.join(config.project_root, "package.json"),
            overrideConfig: {
              rules: {
                "comma-dangle": ["error", "always-multiline"],
                "prettier/prettier": [
                  "error",
                  {
                    plugins: ["prettier-plugin-tailwindcss"],
                    trailingComma: "es5",
                    arrowParens: "always",
                    singleQuote: false,
                    bracketSpacing: true,
                    printWidth: 130,
                    indentChains: true,
                    exportCurlySpacing: true,
                    importCurlySpacing: true,
                    allowBreakAfterOperator: false,
                    breakLongMethodChains: true,
                    importFormatting: "oneline",
                    endOfLine: "auto",
                    ignorePath: null,
                    withNodeModules: true,
                  },
                ],
              },
              ignorePatterns: ["!node_modules/**"], // Force ESLint to include fx-style
            },
          });

          const results = await eslint.lintFiles([tempFilePath]);
          const formattedOutput = results[0]?.output ?? output;

          fs.unlinkSync(tempFilePath);
          writeCompareFile(filePath, formattedOutput, (updated) => {
            if (updated) completed.push(true);
          });
        } catch (error) {
          console.error(error);
          completed.push(false);
        }
      }
    );

    Promise.all([...sectionPromises, ...blockPromises]).then(() => resolve(true));
  });

  console.log(
    `[${chalk.gray(new Date().toLocaleTimeString())}]: [${chalk.magentaBright(`${Date.now() - startTime}ms`)}] ${chalk.cyan(
      `Presets Synchronized with theme ID: ${config.theme_id} - ${config.theme_path}`
    )}`
  );

  if (watch && completed.some((updated) => updated)) {
    getTargets();
    await getSchemaSources();
    parseLocales();
    generateSchemaVariables();
    generateSchemaLocales();
    generateSectionsTypes();
    generateThemeBlocksTypes();
    generateClassicBlocksTypes();
    generateCardsTypes();
    generateSettingTypes();
    generateLiquidFiles();
    return true;
  }
};
