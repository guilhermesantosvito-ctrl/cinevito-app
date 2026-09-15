import { useEffect, useState } from 'react';
import { anonimizeCredit } from '../lib/utils';
// import { supabase } from '../lib/supabase-client';

export function AdminUploadsPage() {
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  async function fetchPendingUploads() {
    setLoading(true);
    setErrorMsg('');
    try {
      // Exemplo de busca no Supabase:
      // const { data, error } = await supabase
      //   .from('video_uploads')
      //   .select('*')
      //   .eq('status', 'pendente')
      //   .order('created_at', { ascending: false });

      // if (error) throw error;
      // setUploads(data || []);
      setUploads([]); // Mock inicial vazio até conectar ao Supabase
    } catch (err: any) {
      setErrorMsg(`Erro ao carregar filas: ${err.message || 'Tente novamente.'}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPendingUploads();
  }, []);

  async function handleApprove(uploadId: string, storagePath: string) {
    try {
      // 1. Copia o arquivo do bucket 'uploads-pendentes' para 'videos-aprovados'
      // await supabase.storage.from('videos-aprovados').copy(storagePath, `approved-${storagePath}`);
      // await supabase.storage.from('uploads-pendentes').remove([storagePath]);

      // 2. Atualiza o status do registro para 'aprovado'
      // await supabase
      //   .from('video_uploads')
      //   .update({ status: 'aprovado', approved_at: new Date().toISOString() })
      //   .eq('id', uploadId);

      fetchPendingUploads();
    } catch (err: any) {
      alert(`Erro ao aprovar: ${err.message}`);
    }
  }

  async function handleReject(uploadId: string) {
    try {
      // await supabase
      //   .from('video_uploads')
      //   .update({ status: 'rejeitado', rejected_at: new Date().toISOString() })
      //   .eq('id', uploadId);

      fetchPendingUploads();
    } catch (err: any) {
      alert(`Erro ao rejeitar: ${err.message}`);
    }
  }

  return (
    <div className="content-wrap page-main">
      <div className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">Administração</div>
          <h1 className="page-title">Moderação de Uploads</h1>
          <p>Analise os vídeos enviados por usuários antes de liberá-los no catálogo.</p>
        </div>
      </div>

      {errorMsg && <p className="form-error" role="alert">{errorMsg}</p>}

      {loading ? (
        <p className="muted" style={{ marginTop: '20px' }}>Carregando submissões...</p>
      ) : uploads.length === 0 ? (
        <div className="panel panel-pad" style={{ marginTop: '20px', textAlign: 'center' }}>
          <p className="muted">Nenhum vídeo aguardando aprovação no momento.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px', marginTop: '20px' }}>
          {uploads.map(item => (
            <div key={item.id} className="panel panel-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '4px' }}>{item.title || item.original_filename}</h3>
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  Enviado por: {item.uploader_email} — <strong>Crédito público:</strong> {anonimizeCredit(item.uploader_email)}
                </p>
                {item.description && <p style={{ fontSize: '0.9rem', marginTop: '6px' }}>{item.description}</p>}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="primary-button focus-tv" 
                  onClick={() => handleApprove(item.id, item.storage_path)}
                >
                  Aprovar
                </button>
                <button 
                  className="secondary-button focus-tv" 
                  style={{ color: '#ff8275' }} 
                  onClick={() => handleReject(item.id)}
                >
                  Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
