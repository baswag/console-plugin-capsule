import * as fs from 'fs';
import * as path from 'path';

interface ConsoleExtension {
  properties?: {
    component?: {
      $codeRef?: string;
    };
  };
}

interface PackageJson {
  consolePlugin: {
    exposedModules: Record<string, string>;
  };
}

describe('plugin metadata', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'),
  ) as PackageJson;
  const extensions = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../console-extensions.json'), 'utf-8'),
  ) as ConsoleExtension[];

  const exposedModules = pkg.consolePlugin.exposedModules;
  const codeRefs = extensions
    .map((ext) => ext.properties?.component?.$codeRef)
    .filter((ref): ref is string => Boolean(ref));

  it('declares an exposedModules entry for every $codeRef used in console-extensions.json', () => {
    for (const ref of codeRefs) {
      expect(exposedModules).toHaveProperty(ref);
    }
  });

  it('has an existing component file for every exposedModules entry', () => {
    for (const modulePath of Object.values(exposedModules)) {
      const resolved = path.resolve(__dirname, `${modulePath}.tsx`);
      expect(fs.existsSync(resolved)).toBe(true);
    }
  });
});
