export function buildProviderSubmissionModelIds(params: {
  isCustomLike: boolean;
  selectedModels: string[];
  customModelIds: string[];
  extraModelIds: string[];
}): string[] {
  const normalizedSelected = params.selectedModels.filter((id) => id.trim());
  const normalizedCustom = params.customModelIds.filter((id) => id.trim());
  const normalizedExtra = params.extraModelIds.filter((id) => id.trim());

  if (params.isCustomLike) {
    return Array.from(new Set([
      ...normalizedSelected,
      ...normalizedCustom,
    ]));
  }

  return Array.from(new Set([
    ...normalizedSelected,
    ...normalizedExtra,
  ]));
}
