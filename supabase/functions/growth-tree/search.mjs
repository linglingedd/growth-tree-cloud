export function keywordPattern(keyword) {
  return `%${keyword.replace(/[\\%_*]/g, '\\$&')}%`;
}
