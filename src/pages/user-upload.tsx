import { useState } from 'react';
// Se o seu cliente Supabase estiver em outro caminho, ajuste o import abaixo
// import { supabase } from '../lib/supabase-client';

export function UserUploadPage({ user }: { user: any }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    
    setLoading(true);
    setMessage('');
    setErrorMsg('');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id || 'anon'}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 1. Envia o arquivo para o bucket privado "uploads-pendentes"
      // const { error: uploadError } = await supabase.storage
      //   .from('uploads-pendentes')
      //   .upload(filePath, file);

      // if (uploadError) throw uploadError;

      // 2. Insere o registro na tabela "video_uploads" com status pendente
      // const { error: dbError } = await supabase
      //   .from('video_uploads')
      //   .insert({
      //     user_id: user?.id,
      //     uploader_email: user?.email,
      //     original_filename: file.name,
      //     storage_path: filePath,
      //     title,
      //     description,
      //     file_size_bytes: file.size,
      //     status: 'pendente'
      //   });

      // if (dbError) throw dbError;

      setMessage('Vídeo enviado com sucesso! Ele passará por moderação e em breve estará no catálogo.');
      setFile(null);
      setTitle('');
      setDescription('');
    } catch (err: any) {
      setErrorMsg(`Erro ao enviar: ${err.message || 'Tente novamente.'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="content-wrap page-main">
      <div className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">Colaboração</div>
          <h1 className="page-title">Enviar Vídeo</h1>
          <p>Envie seu conteúdo para análise da equipe do CineVito.</p>
        </div>
      </div>

      <form onSubmit={handleUpload} className="panel panel-pad" style={{ maxWidth: '600px', marginTop: '20px', display: 'grid', gap: '16px' }}>
        <div className="field">
          <label>Arquivo de Vídeo (MP4 / WebM)</label>
          <input 
            type="file" 
            accept="video/mp4,video/webm" 
            className="input"
            onChange={e => e.target.files && setFile(e.target.files[0])} 
            required 
          />
        </div>

        <div className="field">
          <label>Título</label>
          <input 
            type="text" 
            className="input focus-tv" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            placeholder="Ex: Meu curta-metragem ou gravação" 
          />
        </div>

        <div className="field">
          <label>Descrição</label>
          <textarea 
            className="input focus-tv" 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="Conte um pouco sobre o vídeo..." 
            rows={4}
          />
        </div>

        {message && <p className="form-success" role="status">{message}</p>}
        {errorMsg && <p className="form-error" role="alert">{errorMsg}</p>}

        <button type="submit" className="primary-button focus-tv" disabled={loading}>
          {loading ? 'Enviando arquivo...' : 'Enviar para aprovação'}
        </button>
      </form>
    </div>
  );
}
