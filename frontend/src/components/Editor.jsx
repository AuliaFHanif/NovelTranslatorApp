export default function Editor({
  value,
  onChange,
  placeholder,
  rows = 6,
  className = "",
}) {
  return (
    <textarea
      id="text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`w-full rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical ${className}`}
    />
  );
}
