import fs from "fs";
import path from "path";
import { config, root_dir } from "../../shopify-accelerate";
import { readFile, writeOnlyNew } from "../utils/fs";

export const generateConfigFiles = () => {
  const { theme_path, sources } = config;

  sources.sectionGroups.forEach((file) => {
    const fileName = file.split(/[\\/]/gi).at(-1);
    const targetPath = path.join(process.cwd(), theme_path, "sections", fileName);
    const rawContent = readFile(file, { encoding: "utf-8" });
    writeOnlyNew(targetPath, rawContent);
  });

  sources.configs.forEach((file) => {
    const fileName = file.split(/[\\/]/gi).at(-1);
    const targetPath = path.join(process.cwd(), theme_path, "config", fileName);
    const rawContent = readFile(file, { encoding: "utf-8" });
    writeOnlyNew(targetPath, rawContent);
  });
  sources.templates.forEach((file) => {
    const fileName = file.split(/[\\/]/gi).at(-1);
    const targetPath = path.join(process.cwd(), theme_path, "templates", fileName);
    const rawContent = readFile(file, { encoding: "utf-8" });
    writeOnlyNew(targetPath, rawContent);
  });
  sources.customerTemplates.forEach((file) => {
    const fileName = file.split(/[\\/]/gi).at(-1);
    const targetPath = path.join(process.cwd(), theme_path, "templates/customers", fileName);
    const rawContent = readFile(file, { encoding: "utf-8" });
    writeOnlyNew(targetPath, rawContent);
  });
  sources.liquidTemplates.forEach((file) => {
    const relative_path = path.relative(config.folders.templates, file);
    const targetPath = path.join(process.cwd(), theme_path, "templates", relative_path);
    const rawContent = readFile(file, { encoding: "utf-8" });
    writeOnlyNew(targetPath, rawContent);
  });
};
