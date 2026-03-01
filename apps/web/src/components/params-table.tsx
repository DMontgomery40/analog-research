interface Param {
  name: string
  type: string
  description: string
  required?: boolean
}

export function ParamsTable({
  params,
  showHeader,
}: {
  params: Param[]
  showHeader?: boolean
}) {
  return (
    <div className="bg-background rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        {showHeader && (
          <thead>
            <tr className="border-b border-border bg-card/50">
              <th className="text-left p-2 font-medium">Name</th>
              <th className="text-left p-2 font-medium">Type</th>
              <th className="text-left p-2 font-medium hidden sm:table-cell">Description</th>
            </tr>
          </thead>
        )}
        <tbody>
          {params.map((param) => (
            <tr key={param.name} className="border-b border-border last:border-b-0">
              <td className="p-2 font-mono text-xs">
                {param.name}
                {param.required && <span className="text-red-500 ml-0.5">*</span>}
              </td>
              <td className="p-2 text-xs text-muted-foreground">{param.type}</td>
              <td className="p-2 text-xs text-muted-foreground hidden sm:table-cell">{param.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
