import FileUploadZone from '../FileUploadZone';

export default function FileUploadZoneExample() {
  return (
    <div className="space-y-6 max-w-2xl">
      <FileUploadZone 
        label="Upload Fuel Management Transactions" 
        onFilesSelected={(files) => console.log('Fuel files selected:', files)}
      />
    </div>
  );
}
