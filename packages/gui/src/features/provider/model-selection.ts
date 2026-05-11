export type SelectedModelRef = {
  providerId: string
  modelId: string
}

export type SelectableModelRef = {
  providerId: string
  id: string
  status?: string | null
}

export function selectedModelExists<T extends SelectableModelRef>(
  models: T[],
  selectedModel: SelectedModelRef | null | undefined,
) {
  if (!selectedModel) return false
  return models.some((model) => modelMatchesSelection(model, selectedModel))
}

export function chooseSelectableModel<T extends SelectableModelRef>({
  models,
  selectedModel,
  defaultProviderId,
  defaultModelId,
}: {
  models: T[]
  selectedModel?: SelectedModelRef | null
  defaultProviderId?: string | null
  defaultModelId?: string | null
}) {
  if (!models.length) return null

  if (selectedModel) {
    const current = models.find((model) => modelMatchesSelection(model, selectedModel))
    if (current) return current
  }

  const defaultProviderModels = defaultProviderId
    ? models.filter((model) => model.providerId === defaultProviderId)
    : []
  const defaultModel = defaultModelId
    ? defaultProviderModels.find((model) => model.id === defaultModelId)
    : null

  return (
    defaultModel ??
    defaultProviderModels.find((model) => model.status === "active") ??
    defaultProviderModels[0] ??
    models.find((model) => model.status === "active") ??
    models[0]
  )
}

function modelMatchesSelection(model: SelectableModelRef, selectedModel: SelectedModelRef) {
  return model.providerId === selectedModel.providerId && model.id === selectedModel.modelId
}
