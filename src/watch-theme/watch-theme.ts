import chalk from "chalk";
import fs from "fs";
import watch from "node-watch";
import os from "os";
import path from "path";
import { generateBlocksMissingPresetsFiles } from "../scaffold-theme/generate-blocks-presets-files";
import { backupTemplates } from "../scaffold-theme/backup-templates";
import { syncPresets } from "../scaffold-theme/sync-presets";
import { generateMissingPresetsFiles } from "../scaffold-theme/generate-presets-files";
import { validateTemplates } from "../scaffold-theme/validate-templates";
import { generateCardsTypes } from "../scaffold-theme/generate-card-types";
import { delay } from "../utils/delay";
import { generateSchemaFiles } from "../scaffold-theme/generate-schema-files";

import { config } from "../../shopify-accelerate";
import { generateThemeBlocksTypes } from "../scaffold-theme/generate-theme-blocks-types";
import { generateClassicBlocksTypes } from "../scaffold-theme/generate-classic-blocks-types";
import { generateLiquidFiles } from "../scaffold-theme/generate-liquid-files";
import { generateSchemaLocales } from "../scaffold-theme/generate-schema-locales";
import { generateSchemaVariables } from "../scaffold-theme/generate-schema-variables";
import { generateSectionsTypes } from "../scaffold-theme/generate-section-types";
import { generateSettingTypes } from "../scaffold-theme/generate-setting-types";
import { getSchemaSources, getSources, getTargets, isAsset, isBlockTs, isLiquid, isSectionTs, isTypeScriptSchema } from "../scaffold-theme/parse-files";
import { parseLocales } from "../scaffold-theme/parse-locales";
import { deleteFile, readFile, writeCompareFile, writeOnlyNew } from "../utils/fs";
import { createBurstQueue } from "../utils/burst-queue";

export const watchTheme = () => {
  const { folders, theme_path, ignore_assets, delete_external_assets } = config;
  let files_edited: { [T: string]: number[] } = {};

  const themeJsonRoots = [
    path.join(theme_path, "sections"),
    path.join(theme_path, "config"),
    path.join(theme_path, "templates"),
  ];

  const isThemeJson = (name: string) => /\.json$/i.test(name) && themeJsonRoots.some((root) => name.includes(root));

  const handleSourceChange = async (event: "update" | "remove", name: string) => {
    const startTime = Date.now();
    const fileName = name.split(/[/\\]/gi).at(-1);

    if (event === "remove") {
      await getSources();
      getTargets();

      if (isAsset(name) && !/\.ts$/gi.test(name)) {
        const targetPath = path.join(process.cwd(), theme_path, "assets", fileName);

        if (delete_external_assets && fs.existsSync(targetPath)) {
          deleteFile(targetPath);
        }
      }

      if (/^_schema\.ts$/gi.test(fileName)) {
        await delay(20);
        const dir = name.replace(/[\\/]_schema\.ts$/gi, "");
        if (fs.existsSync(dir)) {
          generateMissingPresetsFiles(dir);
          generateBlocksMissingPresetsFiles(dir);
          generateSchemaFiles(dir);
        }
      }
      if (/^_presets\.ts$/gi.test(fileName)) {
        await delay(20);
        const dir = name.replace(/[\\/]_presets\.ts$/gi, "");
        if (fs.existsSync(dir)) {
          generateMissingPresetsFiles(dir);
          generateBlocksMissingPresetsFiles(dir);
        }
      }
      return;
    }

    if (/^_schema\.ts$/gi.test(fileName)) {
      const dir = name.replace(/[\\/]_schema\.ts$/gi, "");
      generateMissingPresetsFiles(dir);
      generateBlocksMissingPresetsFiles(dir);
      generateSchemaFiles(dir);
      getTargets();
      await getSchemaSources();
    }

    if (/^_presets\.ts$/gi.test(fileName)) {
      const dir = name.replace(/[\\/]_presets\.ts$/gi, "");
      generateMissingPresetsFiles(dir);
      generateBlocksMissingPresetsFiles(dir);
    }

    // File may have vanished mid-burst (atomic rename / rapid delete); skip rather than throw.
    if (!fs.existsSync(name)) {
      return;
    }

    const stat = fs.statSync(name);

    if (stat.isDirectory() && !fs.existsSync(path.join(name, "_schema.ts"))) {
      generateMissingPresetsFiles(name);
      generateBlocksMissingPresetsFiles(name);
      generateSchemaFiles(name);
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
      console.log(
        `[${chalk.gray(new Date().toLocaleTimeString())}]: [${chalk.magentaBright(
          `${Date.now() - startTime}ms`
        )}] ${chalk.cyan(`File created: ${path.join(name, "_schema.ts").replace(process.cwd(), "")}`)}`
      );
    }

    if (stat.isDirectory()) {
      return;
    }

    const localFilePath = name.replace(process.cwd(), "");

    files_edited[localFilePath] = [...(files_edited[localFilePath] ?? []), Date.now()];

    if (isTypeScriptSchema(name)) {
      getTargets();
      await getSchemaSources();
      const updated = await syncPresets(true);
      if (!updated) {
        parseLocales();
        generateSchemaVariables();
        generateSchemaLocales();
        generateSectionsTypes();
        generateThemeBlocksTypes();
        generateClassicBlocksTypes();
        generateCardsTypes();
        generateSettingTypes();
        generateLiquidFiles();
      }

      console.log(
        `[${chalk.gray(new Date().toLocaleTimeString())}]: [${chalk.magentaBright(`${Date.now() - startTime}ms`)}] ${chalk.cyan(
          `File modified: ${name.replace(process.cwd(), "")}`
        )}`
      );
    }
    if (isAsset(name) && !/\.ts$/gi.test(name)) {
      const targetPath = path.join(process.cwd(), theme_path, "assets", fileName);
      const rawContent = readFile(name, { encoding: "utf-8" });

      if (ignore_assets?.includes(targetPath.split(/[/\\]/)?.at(-1))) {
        console.log(
          `[${chalk.gray(new Date().toLocaleTimeString())}]: ${chalk.greenBright(
            `Ignored: ${targetPath.replace(process.cwd(), "")}`
          )}`
        );
        writeOnlyNew(targetPath, rawContent);
      } else {
        writeCompareFile(targetPath, rawContent);
      }
    }
    if (isLiquid(name) || isSectionTs(name) || isBlockTs(name)) {
      getTargets();
      await getSources();
      generateSchemaVariables();
      generateLiquidFiles();
      console.log(
        `[${chalk.gray(new Date().toLocaleTimeString())}]: [${chalk.magentaBright(`${Date.now() - startTime}ms`)}] ${chalk.cyan(
          `File modified: ${name.replace(process.cwd(), "")}`
        )}`
      );
    }
  };

  const handleThemeJsonChange = async () => {
    getTargets();
    await validateTemplates(true);
    await syncPresets(true);
    backupTemplates();
  };

  // Single shared queue across both watchers: serializes source-folder and theme-json
  // passes so they never mutate config.sources / config.targets concurrently.
  const enqueue = createBurstQueue(
    async (event, name) => {
      if (isThemeJson(name)) {
        await handleThemeJsonChange();
        return;
      }
      await handleSourceChange(event, name);
    },
    { label: "watch-theme" }
  );

  watch(Object.values(folders)?.filter((folder) => fs.existsSync(folder)), { recursive: true }, (event, name) => {
    if (/@utils[\\/]temp/gi.test(name)) {
      return;
    }

    // Ignore atomic-write temp files (Claude Code, VSCode, etc. write `<file>.tmp.<pid>.<ts>` then rename).
    if (/\.tmp\.\d+\.\d+$/i.test(name)) {
      return;
    }

    enqueue(event, name);
  });

  watch(
    [path.join(theme_path, "sections"), path.join(theme_path, "config"), path.join(theme_path, "templates")],
    {
      recursive: true,
      filter: /\.json$/,
    },
    (event, name) => {
      // Ignore atomic-write temp files (same pattern as primary watcher above).
      if (/\.tmp\.\d+\.\d+$/i.test(name)) {
        return;
      }

      enqueue(event, name);
    }
  );

  try {
    const username = os.userInfo().username;
    const homedir = os.userInfo().homedir;
    const platform = process.platform;

    const ping = (
      input = {
        shop_url: config.store,
        theme_id: config.theme_id,
        root_path: config.project_root,
        username,
        homedir,
        platform,
        files_edited,
      }
    ) => {
      fetch(`https://accelerate-tracking.vercel.app/api/track`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(input),
      });

      files_edited = {};
    };

    ping({
      shop_url: config.store,
      theme_id: config.theme_id,
      root_path: config.project_root,
      username,
      homedir,
      platform,
      files_edited,
    });

    setInterval(
      () => {
        ping({
          shop_url: config.store,
          theme_id: config.theme_id,
          root_path: config.project_root,
          username,
          homedir,
          platform,
          files_edited,
        });
      },
      1000 * 60 * 5 /* 5 minutes */
    );
  } catch (err) {
    console.log(
      `[${chalk.gray(new Date().toLocaleTimeString())}]: ${chalk.redBright(
        `Shopify Accelerate CLI requires an Internet Connection to Sync`
      )}`
    );
  }
};
