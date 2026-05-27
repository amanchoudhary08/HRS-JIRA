import React from "react";
import { useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { ProjectSidebar } from "../components/ProjectSidebar";
import { PipelineToolbar } from "../pipeline/toolbar";
import { PipelineUI } from "../pipeline/ui";
import { SubmitButton } from "../pipeline/submit";
import "../pipeline/pipeline.css";

export const PipelinePage = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <Layout
      sidebar={<ProjectSidebar projectId={id ?? ""} />}
      backTo={`/projects/${id}`}
      backLabel="← Back to project"
      mainStyle={{
        padding: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background:
            "radial-gradient(circle at 20% 30%, rgba(124,58,237,0.55) 0%, rgba(109,40,217,0.35) 30%, rgba(59,7,100,0.25) 55%, rgba(0,0,0,0.9) 75%), linear-gradient(180deg,#020617 0%,#000000 100%)",
        }}
      >
        <PipelineToolbar />
        <PipelineUI />
        <SubmitButton />
      </div>
    </Layout>
  );
};
