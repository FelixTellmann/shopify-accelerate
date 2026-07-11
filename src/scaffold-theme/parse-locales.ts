import { ShopifyHeader, ShopifyParagraph, ShopifySection, ShopifySettings, ShopifySettingsInput } from "../../@types/shopify";
import { config } from "../../shopify-accelerate";
import { toLocaleFriendlySnakeCase } from "../utils/to-snake-case";

export function parseLocales() {
  const { sources } = config;
  const sections = sources.sectionSchemas;
  const blocks = sources.blockSchemas;
  const classic_blocks = sources.classic_blockSchemas;
  const cards = sources.cardSchemas;
  const settings = sources.settingsSchema;
  const entries: { [T: string]: string[] } = {};

  const mapSettings = (settings: (ShopifySettingsInput | ShopifyHeader | ShopifyParagraph)[], source?: any) => {
    settings?.forEach((setting) => {
      try {
        if (setting.type === "paragraph" || setting.type === "header") {
          if (setting.content.split(" ").length > 4) {
            return;
          }
          const [key, value] = [toLocaleFriendlySnakeCase(setting.content), setting.content];
          if (entries[key]) {
            entries[key].push(value);
          } else {
            entries[key] = [value];
          }
          return;
        }

        if (setting?.id) {
          if (setting.type === "color_scheme_group") {
            return;
          }
          if (setting.type === "select" || setting.type === "radio") {
            setting.options.forEach((option, index) => {
              const [key, value] = [toLocaleFriendlySnakeCase(option.label), option.label];
              if (entries[key]) {
                entries[key].push(value);
              } else {
                entries[key] = [value];
              }
            });
          }
          if (setting.label) {
            const [key, value] = [toLocaleFriendlySnakeCase(setting.label), setting.label];
            if (entries[key]) {
              entries[key].push(value);
            } else {
              entries[key] = [value];
            }
          }

          if (setting.info) {
            if (setting.info.split(" ").length <= 4) {
              const [key, value] = [toLocaleFriendlySnakeCase(setting.info), setting.info];
              if (entries[key]) {
                entries[key].push(value);
              } else {
                entries[key] = [value];
              }
            }
          }
          if ("placeholder" in setting && typeof setting.placeholder === "string") {
            const [key, value] = [toLocaleFriendlySnakeCase(setting.placeholder), setting.placeholder];
            if (entries[key]) {
              entries[key].push(value);
            } else {
              entries[key] = [value];
            }
          }
        }
      } catch (e) {
        console.log({ settings, source });
      }
    });
  };

  Object.values(sections).forEach((section) => {
    const blocks = section.blocks?.filter((block) => block.type !== "@app" && block.type !== "@theme") ?? [];
    mapSettings(section.settings, section.name);
    blocks.forEach((block) => mapSettings(block.settings));
  });

  Object.values(blocks).forEach((section) => {
    const blocks = section.blocks?.filter((block) => block.type !== "@app" && block.type !== "@theme") ?? [];
    mapSettings(section.settings, section.name);
    blocks.forEach((block) => mapSettings(block.settings));
  });

  Object.values(classic_blocks).forEach((section) => {
    mapSettings(section.settings, section.name);
  });

  Object.values(cards).forEach((section) => {
    mapSettings(section.settings, section.name);
  });

  settings.forEach((settingsSection) => {
    if (!("settings" in settingsSection)) return;
    mapSettings(settingsSection.settings, settingsSection.name);
  });

  config.sources.locale_duplicates = entries;
}
