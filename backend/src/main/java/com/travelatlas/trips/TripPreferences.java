package com.travelatlas.trips;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import javax.validation.Valid;
import javax.validation.constraints.*;

public class TripPreferences {
    @NotNull @Pattern(regexp="relaxed|balanced|packed") private String pace="balanced";
    @NotNull @Pattern(regexp="economy|standard|comfort") private String budgetLevel="standard";
    @NotNull @DecimalMin("0") @DecimalMax("999999999") private BigDecimal budgetAmount=BigDecimal.ZERO;
    @Min(1) @Max(30) private int travelers=1;
    @NotNull @Pattern(regexp="walk|transit|drive") private String transport="transit";
    @Size(max=120) private String departure="";
    @NotNull @Size(max=8) private List<@NotNull @Pattern(regexp="culture|food|nature|family|city|wellness|photography|adventure") String> styles=new ArrayList<>();
    @Size(max=2000) private String mustDo="";
    @Size(max=2000) private String avoid="";
    @NotNull @Size(max=80) @Valid private List<@NotNull @Valid ChecklistItem> checklist=new ArrayList<>();
    public String getPace(){return pace;} public void setPace(String v){pace=v;}
    public String getBudgetLevel(){return budgetLevel;} public void setBudgetLevel(String v){budgetLevel=v;}
    public BigDecimal getBudgetAmount(){return budgetAmount;} public void setBudgetAmount(BigDecimal v){budgetAmount=v;}
    public int getTravelers(){return travelers;} public void setTravelers(int v){travelers=v;}
    public String getTransport(){return transport;} public void setTransport(String v){transport=v;}
    public String getDeparture(){return departure;} public void setDeparture(String v){departure=v;}
    public List<String> getStyles(){return styles;} public void setStyles(List<String> v){styles=v;}
    public String getMustDo(){return mustDo;} public void setMustDo(String v){mustDo=v;}
    public String getAvoid(){return avoid;} public void setAvoid(String v){avoid=v;}
    public List<ChecklistItem> getChecklist(){return checklist;} public void setChecklist(List<ChecklistItem> v){checklist=v;}
    public static class ChecklistItem {
        @NotBlank @Size(max=80) private String id;
        @NotBlank @Size(max=180) private String text;
        private boolean done;
        public String getId(){return id;} public void setId(String v){id=v;}
        public String getText(){return text;} public void setText(String v){text=v;}
        public boolean isDone(){return done;} public void setDone(boolean v){done=v;}
    }
}
