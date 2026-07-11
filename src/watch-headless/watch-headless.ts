import chalk from "chalk";
import fs from "fs";
import watch from "node-watch";
import path from "path";
import { generateCardsTypes } from "../scaffold-theme/generate-card-types";
import { generateClassicBlocksTypes } from "../scaffold-theme/generate-classic-blocks-types";
import { config } from "../../shopify-accelerate";
import { generateThemeBlocksTypes } from "../scaffold-theme/generate-theme-blocks-types";
import { generateSectionsTypes } from "../scaffold-theme/generate-section-types";
import { generateSettingTypes } from "../scaffold-theme/generate-setting-types";
import { getSchemaSources, getSources, isTypeScriptSchema } from "../scaffold-theme/parse-files";
import { capitalize } from "../utils/capitalize";
import { writeCompareFile, writeOnlyNew } from "../utils/fs";
import { createBurstQueue } from "../utils/burst-queue";

export const watchHeadless = () => {
  const { folders } = config;

  console.log({ folders });

  const enqueue = createBurstQueue(
    async (event, name) => {
      const startTime = Date.now();

      if (event === "remove") {
        await getSources();
      }
      if (isTypeScriptSchema(name)) {
        await getSchemaSources();
        generateSectionsTypes();
        generateThemeBlocksTypes();
        generateClassicBlocksTypes();
        generateCardsTypes();
        generateSettingTypes();

        const imports = [`import type { FC } from "react";`];
        const renderBlocks = [];
        Object.entries(config.sources.sectionSchemas ?? {})?.forEach(([key, entry]) => {
          imports.push(`import { ${capitalize(key)} } from "sections/${entry.folder}/${entry.folder}";`);
          renderBlocks.push(`    case "${entry.folder}": {
      return <${capitalize(key)} {...section} />;
    }`);

          writeOnlyNew(
            entry.path?.replace("_schema.ts", `${entry.folder}.tsx`),
            `import type { ${capitalize(key)}Section } from "types/sections.js";

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

        console.log(
          `[${chalk.gray(new Date().toLocaleTimeString())}]: [${chalk.magentaBright(`${Date.now() - startTime}ms`)}] ${chalk.cyan(
            `File modified: ${name.replace(process.cwd(), "")}`
          )}`
        );
      }
    },
    { label: "watch-headless" }
  );

  watch(Object.values(folders)?.filter((folder) => fs.existsSync(folder)), { recursive: true }, (event, name) => {
    enqueue(event, name);
  });
};
