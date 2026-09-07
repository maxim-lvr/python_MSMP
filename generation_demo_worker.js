import { generateDemo } from './generation_demo_generator.js';

self.onmessage = async ({ data }) => {
  try {
    const sources = {};
    for (const [key, name] of Object.entries({ dense: 'dense_1', bridge: 'bridge_zone', long: 'building_long_minecraft', house: 'house_zone' })) {
      const response = await fetch(`./exports/${name}.json`);
      if (!response.ok) throw new Error(`Impossible de charger le build original : ${name}`);
      sources[key] = await response.json();
    }
    self.postMessage({ id: data.id, result: generateDemo(data.seed, sources) });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
